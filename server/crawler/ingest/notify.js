const { matchesCriteria } = require('../criteria');
const { debugLog } = require('../shared/debug');

function defaultModels() {
  const { FilterPreset, Notification } = require('../../../db/models');
  return { FilterPreset, Notification };
}

function toMatchShape(listing) {
  const row = typeof listing.toJSON === 'function' ? listing.toJSON() : listing;
  return {
    maker: row.maker,
    model: row.model,
    totalPrice: Number(row.totalPrice),
    modelYear: row.modelYear,
    mileageKm: row.mileageKm,
    bodyType: row.bodyType,
    fuelType: row.fuelType,
    transmission: row.transmission,
    prefecture: row.prefecture,
  };
}

async function notifyMatches(listing, { telegram, models = defaultModels() } = {}) {
  const { FilterPreset, Notification } = models;
  const row = typeof listing.toJSON === 'function' ? listing.toJSON() : listing;
  const presets = await FilterPreset.findAll({ where: { enabled: true } });
  const shaped = toMatchShape(row);
  debugLog('worker.notify.scan.start', {
    listingId: row.id,
    source: row.source,
    presetCount: presets.length,
    shaped,
  });

  let matchCount = 0;
  for (const preset of presets) {
    if (!Array.isArray(preset.sites) || !preset.sites.includes(row.source)) {
      debugLog('worker.notify.preset.skippedSite', {
        listingId: row.id,
        presetId: preset.id,
        sites: preset.sites,
        source: row.source,
      });
      continue;
    }
    if (!matchesCriteria(shaped, preset.criteria || {})) {
      debugLog('worker.notify.preset.skippedCriteria', {
        listingId: row.id,
        presetId: preset.id,
        criteria: preset.criteria,
      });
      continue;
    }

    // Re-runs of a preset re-discover the same listing, so dedupe on (listingId, presetId):
    // only the first match for a given listing/preset pair creates a row and fires telegram.
    const [, created] = await Notification.findOrCreate({
      where: { listingId: row.id, presetId: preset.id },
    });
    if (!created) {
      debugLog('worker.notify.preset.alreadyNotified', { listingId: row.id, presetId: preset.id });
      continue;
    }

    matchCount += 1;
    debugLog('worker.notify.created', {
      listingId: row.id,
      presetId: preset.id,
      telegramChatId: preset.telegramChatId,
    });

    if (telegram && preset.telegramChatId) {
      const text = `New match (${preset.name}): ${row.maker || ''} ${row.model || ''} - JPY ${row.totalPrice || '?'}\n${row.url}`;
      await telegram
        .send(preset.telegramChatId, text)
        .then(() =>
          debugLog('worker.notify.telegram.sent', {
            listingId: row.id,
            presetId: preset.id,
            telegramChatId: preset.telegramChatId,
          })
        )
        .catch(error =>
          debugLog('worker.notify.telegram.error', {
            listingId: row.id,
            presetId: preset.id,
            telegramChatId: preset.telegramChatId,
            message: error?.message || String(error),
          })
        );
    }
  }

  debugLog('worker.notify.scan.done', { listingId: row.id, matchCount });
  return matchCount;
}

module.exports = {
  notifyMatches,
};

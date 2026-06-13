const { matchesCriteria } = require('../criteria');
const { debugLog } = require('../shared/debug');
const { buildCaption, buildKeyboard, coverPhoto } = require('../listing-format');

// Lazily required so tests that don't touch the autoCreateVehicles path don't
// pull in db/models (which needs a DB connection) at import time.
function defaultCreateVehicle() {
  return require('../import-vehicle').createVehicleFromListing;
}

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

// Public website vehicle preview: FRONT_HOST_NAME/<locale>/inventory/<slug>.
function vehicleUrl(slug) {
  const base = process.env.FRONT_HOST_NAME;
  if (!base || !slug) return null;
  return `${base.replace(/\/$/, '')}/en/inventory/${slug}`;
}

// Sends one matched listing to a preset's Telegram chat as a photo post with
// inline action buttons. Falls back to a plain text message when there's no photo.
async function sendListingPost(row, preset, { telegram, createVehicle }) {
  let url = null;
  if (preset.autoCreateVehicles) {
    // Idempotent: the listing worker also imports for autoCreate presets, but
    // findOrCreate dedupes. Ensuring it here lets the "View vehicle" link resolve.
    const create = createVehicle || defaultCreateVehicle();
    const { vehicle } = await create(row.id);
    url = vehicleUrl(vehicle.slug);
  }

  const keyboard = buildKeyboard({
    listingId: row.id,
    autoCreateVehicles: preset.autoCreateVehicles,
    vehicleUrl: url,
  });

  const cover = coverPhoto(row);
  if (cover && typeof telegram.sendPhoto === 'function') {
    const caption = buildCaption(row, { html: true });
    await telegram.sendPhoto(preset.telegramChatId, cover, caption, keyboard);
    return;
  }

  const text = `New match (${preset.name}): ${row.maker || ''} ${row.model || ''} - JPY ${row.totalPrice || '?'}\n${row.url}`;
  await telegram.send(preset.telegramChatId, text);
}

async function notifyMatches(listing, { telegram, models = defaultModels(), createVehicle } = {}) {
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
      await sendListingPost(row, preset, { telegram, createVehicle })
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
  sendListingPost,
};

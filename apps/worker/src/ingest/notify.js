import { eq, sql } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { matchesCriteria } from "@jdm-pro/crawler/criteria";
import { debugLog } from "@jdm-pro/shared";
import { buildCaption, buildKeyboard, coverPhoto } from "../listingFormat.js";
import { createVehicleFromListing } from "../importVehicle.js";

function toMatchShape(row) {
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
  return `${base.replace(/\/$/, "")}/en/inventory/${slug}`;
}

// Sends one matched listing to a preset's Telegram chat as a photo post with
// inline action buttons. Falls back to a plain text message when there's no photo.
export async function sendListingPost(row, preset, { telegram, createVehicle }) {
  let url = null;
  if (preset.autoCreateVehicles) {
    // Idempotent: the listing worker also imports for autoCreate presets, but
    // findOrCreate dedupes. Ensuring it here lets the "View vehicle" link resolve.
    const { vehicle } = await createVehicle(row.id);
    url = vehicleUrl(vehicle.slug);
  }

  const keyboard = buildKeyboard({
    listingId: row.id,
    autoCreateVehicles: preset.autoCreateVehicles,
    vehicleUrl: url,
  });

  const cover = coverPhoto(row);
  if (cover && typeof telegram.sendPhoto === "function") {
    const caption = buildCaption(row, { html: true });
    await telegram.sendPhoto(preset.telegramChatId, cover, caption, keyboard);
    return;
  }

  const text = `New match (${preset.name}): ${row.maker || ""} ${row.model || ""} - JPY ${row.totalPrice || "?"}\n${row.url}`;
  await telegram.send(preset.telegramChatId, text);
}

// Evaluated on EVERY crawl (not just isNew): a listing that becomes a match
// after a price drop should still notify. Dedupe is on (listingId, presetId)
// via the partial unique index, so repeats never re-notify.
export async function notifyMatches(
  listing,
  {
    db,
    telegram,
    createVehicle,
    loadPresets,
    recordNotification,
  } = {}
) {
  const row = typeof listing.toJSON === "function" ? listing.toJSON() : listing;

  const presets = loadPresets
    ? await loadPresets()
    : await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.enabled, true));

  const record =
    recordNotification ||
    (async (listingId, presetId) => {
      const inserted = await db
        .insert(schema.notifications)
        .values({ listingId, presetId })
        .onConflictDoNothing({
          target: [schema.notifications.listingId, schema.notifications.presetId],
          where: sql`preset_id is not null`,
        })
        .returning();
      return inserted.length > 0;
    });

  const createVeh = createVehicle || ((listingId) => createVehicleFromListing(db, listingId));

  const shaped = toMatchShape(row);
  debugLog("worker.notify.scan.start", {
    listingId: row.id,
    source: row.source,
    presetCount: presets.length,
    shaped,
  });

  let matchCount = 0;
  for (const preset of presets) {
    if (!Array.isArray(preset.sites) || !preset.sites.includes(row.source)) {
      debugLog("worker.notify.preset.skippedSite", {
        listingId: row.id,
        presetId: preset.id,
        sites: preset.sites,
        source: row.source,
      });
      continue;
    }
    if (!matchesCriteria(shaped, preset.criteria || {})) {
      debugLog("worker.notify.preset.skippedCriteria", {
        listingId: row.id,
        presetId: preset.id,
        criteria: preset.criteria,
      });
      continue;
    }

    const created = await record(row.id, preset.id);
    if (!created) {
      debugLog("worker.notify.preset.alreadyNotified", { listingId: row.id, presetId: preset.id });
      continue;
    }

    matchCount += 1;
    debugLog("worker.notify.created", {
      listingId: row.id,
      presetId: preset.id,
      telegramChatId: preset.telegramChatId,
    });

    if (telegram && preset.telegramChatId) {
      await sendListingPost(row, preset, { telegram, createVehicle: createVeh })
        .then(() =>
          debugLog("worker.notify.telegram.sent", {
            listingId: row.id,
            presetId: preset.id,
            telegramChatId: preset.telegramChatId,
          })
        )
        .catch((error) =>
          debugLog("worker.notify.telegram.error", {
            listingId: row.id,
            presetId: preset.id,
            telegramChatId: preset.telegramChatId,
            message: error?.message || String(error),
          })
        );
    }
  }

  debugLog("worker.notify.scan.done", { listingId: row.id, matchCount });
  return matchCount;
}

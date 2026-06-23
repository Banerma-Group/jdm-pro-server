import crypto from "crypto";
import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";

// Mirrors the dashboard's vehicle-form slug format ("make-model-<suffix>") so
// crawler-created vehicles get a public-website slug and the Telegram "View
// vehicle" button can deep-link to /<locale>/inventory/<slug>.
function vehicleSlug(make, model) {
  const base = `${make || ""}-${model || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : suffix;
}

function numberString(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function photoName(url, index) {
  try {
    const basename = new URL(url).pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(basename || `listing-photo-${index + 1}`);
  } catch {
    return `listing-photo-${index + 1}`;
  }
}

export function vehicleAttrsFromListing(listing) {
  const row = typeof listing.toJSON === "function" ? listing.toJSON() : listing;
  return {
    make: row.maker || null,
    model: row.model || null,
    mileage: numberString(row.mileageKm),
    color: row.color || null,
    transmission: row.transmission || null,
    price: numberString(row.totalPrice ?? row.vehiclePrice),
    year: row.modelYear || null,
    description: row.descriptionOriginal || null,
    status: "available",
    locale: "ja",
    isPosted: false,
    isMain: false,
    slug: vehicleSlug(row.maker, row.model),
    crawlerListingId: row.id,
  };
}

export async function attachListingPhotos(tx, vehicle, listing) {
  const row = typeof listing.toJSON === "function" ? listing.toJSON() : listing;
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
  if (!photos.length) return [];

  const seen = new Set();
  const vmRows = [];

  for (const [index, url] of photos.entries()) {
    if (seen.has(url)) continue;
    seen.add(url);

    const [media] = await tx
      .insert(schema.media)
      .values({ url, name: photoName(url, index) })
      .returning();

    vmRows.push({
      vehicleId: vehicle.id,
      mediaId: media.id,
      sortOrder: vmRows.length + 1,
      isCover: vmRows.length === 0,
    });
  }

  if (vmRows.length) {
    await tx.insert(schema.vehicleMedia).values(vmRows).onConflictDoNothing();
  }

  return vmRows;
}

// findOrCreate-by-crawlerListingId. Idempotent: a unique index on
// vehicles.crawler_listing_id guarantees one vehicle per listing even under the
// concurrent autoCreate paths (listing worker + telegram bot + manual import).
export async function createVehicleFromListing(db, listingOrId, { tx } = {}) {
  const run = async (t) => {
    let listing;
    if (typeof listingOrId === "string") {
      [listing] = await t
        .select()
        .from(schema.listings)
        .where(eq(schema.listings.id, listingOrId))
        .limit(1);
    } else {
      listing = listingOrId;
    }

    if (!listing) {
      const error = new Error("Listing not found");
      error.status = 404;
      throw error;
    }

    const existingFirst = await t
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.crawlerListingId, listing.id))
      .limit(1);
    if (existingFirst.length) return { vehicle: existingFirst[0], created: false };

    const inserted = await t
      .insert(schema.vehicles)
      .values(vehicleAttrsFromListing(listing))
      .onConflictDoNothing({ target: schema.vehicles.crawlerListingId })
      .returning();

    if (inserted.length) {
      await attachListingPhotos(t, inserted[0], listing);
      return { vehicle: inserted[0], created: true };
    }

    // Lost an insert race — fetch the row the other writer created.
    const [existing] = await t
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.crawlerListingId, listing.id))
      .limit(1);
    return { vehicle: existing, created: false };
  };

  if (tx) return run(tx);
  return db.transaction(run);
}

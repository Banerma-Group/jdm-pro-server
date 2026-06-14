import { and, eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { canonicalMaker } from "@jdm-pro/lookup";
import { debugLog } from "@jdm-pro/shared";

const listingFields = [
  "source",
  "sourceListingId",
  "url",
  "maker",
  "model",
  "grade",
  "modelYear",
  "mileageKm",
  "displacementCc",
  "transmission",
  "fuelType",
  "bodyType",
  "drivetrain",
  "color",
  "doors",
  "seats",
  "inspectionUntil",
  "repairHistory",
  "totalPrice",
  "vehiclePrice",
  "prefecture",
  "dealerName",
  "photos",
  "descriptionOriginal",
  "raw",
];

export function normalizeListing(canonical) {
  const out = {};
  for (const field of listingFields) {
    if (field in canonical) out[field] = canonical[field];
  }
  out.maker = canonicalMaker(out.maker);
  out.photos = Array.isArray(out.photos) ? out.photos.filter(Boolean) : [];
  return out;
}

function numberOrNull(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function upsertListing(db, canonical) {
  const listingData = normalizeListing(canonical);
  const { source, sourceListingId } = listingData;
  if (!source || !sourceListingId) throw new Error("Parsed listing is missing source/sourceListingId");

  debugLog("worker.ingest.upsert.request", {
    source,
    sourceListingId,
    maker: listingData.maker,
    model: listingData.model,
    totalPrice: listingData.totalPrice,
    photoCount: listingData.photos?.length || 0,
  });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.listings)
      .where(and(eq(schema.listings.source, source), eq(schema.listings.sourceListingId, sourceListingId)))
      .limit(1);
    const newPrice = numberOrNull(listingData.totalPrice);

    if (!existing) {
      const [listing] = await tx
        .insert(schema.listings)
        .values({ ...listingData, status: "active" })
        .returning();
      if (newPrice != null) await tx.insert(schema.priceHistory).values({ listingId: listing.id, price: newPrice });
      debugLog("worker.ingest.upsert.inserted", { listingId: listing.id, source, sourceListingId, totalPrice: newPrice });
      return { listing, isNew: true, priceChanged: false };
    }

    const priceChanged = newPrice != null && numberOrNull(existing.totalPrice) !== newPrice;
    const [listing] = await tx
      .update(schema.listings)
      .set({
        ...listingData,
        status: "active",
        consecutiveMisses: 0,
        lastSeenAt: new Date(),
      })
      .where(eq(schema.listings.id, existing.id))
      .returning();

    if (priceChanged) await tx.insert(schema.priceHistory).values({ listingId: existing.id, price: newPrice });
    debugLog("worker.ingest.upsert.updated", {
      listingId: existing.id,
      source,
      sourceListingId,
      previousPrice: existing.totalPrice,
      newPrice,
      priceChanged,
    });

    return { listing, isNew: false, priceChanged };
  });
}

import { and, eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { debugLog } from "@jdm-pro/shared";

const SOLD_THRESHOLD = Number(process.env.CRAWLER_SOLD_THRESHOLD || 3);

export async function markMisses(db, site, seenIds) {
  const active = await db
    .select()
    .from(schema.listings)
    .where(and(eq(schema.listings.source, site), eq(schema.listings.status, "active")));
  debugLog("worker.soldDetection.start", { site, activeCount: active.length, seenCount: seenIds.size });

  let bumpedCount = 0;
  let soldCount = 0;
  for (const listing of active) {
    if (seenIds.has(listing.sourceListingId)) continue;
    const misses = Number(listing.consecutiveMisses || 0) + 1;
    await db
      .update(schema.listings)
      .set({
        consecutiveMisses: misses,
        status: misses >= SOLD_THRESHOLD ? "sold_removed" : "active",
      })
      .where(eq(schema.listings.id, listing.id));
    bumpedCount += 1;
    if (misses >= SOLD_THRESHOLD) soldCount += 1;
    debugLog("worker.soldDetection.miss", {
      listingId: listing.id,
      sourceListingId: listing.sourceListingId,
      site,
      misses,
      sold: misses >= SOLD_THRESHOLD,
    });
  }

  debugLog("worker.soldDetection.done", {
    site,
    activeCount: active.length,
    seenCount: seenIds.size,
    bumpedCount,
    soldCount,
  });
  return { bumpedCount, soldCount };
}

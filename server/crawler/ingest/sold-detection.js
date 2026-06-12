const { Listing } = require('../../../db/models');
const { debugLog } = require('../shared/debug');

const SOLD_THRESHOLD = Number(process.env.CRAWLER_SOLD_THRESHOLD || 3);

async function markMisses(site, seenIds) {
  const active = await Listing.findAll({ where: { source: site, status: 'active' } });
  debugLog('worker.soldDetection.start', { site, activeCount: active.length, seenCount: seenIds.size });

  let bumpedCount = 0;
  let soldCount = 0;
  for (const listing of active) {
    if (seenIds.has(listing.sourceListingId)) continue;
    const misses = Number(listing.consecutiveMisses || 0) + 1;
    await listing.update({
      consecutiveMisses: misses,
      status: misses >= SOLD_THRESHOLD ? 'sold_removed' : 'active',
    });
    bumpedCount += 1;
    if (misses >= SOLD_THRESHOLD) soldCount += 1;
    debugLog('worker.soldDetection.miss', {
      listingId: listing.id,
      sourceListingId: listing.sourceListingId,
      site,
      misses,
      sold: misses >= SOLD_THRESHOLD,
    });
  }

  debugLog('worker.soldDetection.done', { site, activeCount: active.length, seenCount: seenIds.size, bumpedCount, soldCount });
  return { bumpedCount, soldCount };
}

module.exports = {
  markMisses,
};

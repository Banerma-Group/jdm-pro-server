const { createDbCache } = require('../lookup/cache');
const { createOpenAiTranslator } = require('../lookup/openai');
const { getAdapter } = require('../adapters');
const { fetchDocument } = require('../browser');
const { upsertListing } = require('../ingest/upsert');
const { notifyMatches } = require('../ingest/notify');
const { createTelegram } = require('../telegram');
const { mirrorListingPhotos } = require('../s3/images');
const { debugLog } = require('../shared/debug');
const { listingQueue, JOB_CRAWL_LISTING } = require('../../queues/crawler');
const { FilterPreset } = require('../../../db/models');
const { createVehicleFromListing } = require('../import-vehicle');

async function processListingJob(
  job,
  {
    deps = { cache: createDbCache(), openai: createOpenAiTranslator() },
    telegram = createTelegram(),
    getAdapterImpl = getAdapter,
    fetchDocumentImpl = fetchDocument,
    mirrorListingPhotosImpl = mirrorListingPhotos,
    upsertListingImpl = upsertListing,
    notifyMatchesImpl = notifyMatches,
    createVehicleFromListingImpl = createVehicleFromListing,
  } = {}
) {
  const { site, url, presetId } = job.data || {};
  debugLog('worker.listing.job.start', { id: job.id, name: job.name, site, url, presetId });

  const adapter = getAdapterImpl(site);
  debugLog('worker.listing.adapter.selected', { id: job.id, site: adapter.site });

  const doc = await fetchDocumentImpl(url, { charset: adapter.listingCharset });
  debugLog('worker.listing.document.fetched', { id: job.id, site, url });

  const parsed = await adapter.parseListingPage(doc, url, deps);
  debugLog('worker.listing.parsed', {
    id: job.id,
    site,
    sourceListingId: parsed.sourceListingId,
    maker: parsed.maker,
    model: parsed.model,
    totalPrice: parsed.totalPrice,
    photoCount: parsed.photos?.length || 0,
  });

  const canonical = await mirrorListingPhotosImpl(parsed);
  debugLog('worker.listing.photos.mirrored', {
    id: job.id,
    site,
    sourceListingId: canonical.sourceListingId,
    photoCount: canonical.photos?.length || 0,
  });

  const { listing, isNew } = await upsertListingImpl(canonical);
  debugLog('worker.listing.upserted', {
    id: job.id,
    listingId: listing.id,
    sourceListingId: listing.sourceListingId,
    isNew,
  });

  // Evaluate matches on every crawl, not just first insert — listings that already existed
  // (e.g. crawled before the preset was created) must still notify. notifyMatches dedupes
  // on (listingId, presetId), so repeat crawls never create duplicates or re-send telegram.
  await notifyMatchesImpl(listing, { telegram });

  let vehicleId = null;
  if (presetId) {
    const preset = await FilterPreset.findByPk(presetId);
    if (preset?.autoCreateVehicles) {
      const { vehicle, created } = await createVehicleFromListingImpl(listing, { presetId });
      vehicleId = vehicle.id;
      debugLog('worker.listing.vehicleImported', {
        id: job.id,
        listingId: listing.id,
        vehicleId,
        created,
        presetId,
      });
    }
  }

  debugLog('worker.listing.job.done', { id: job.id, listingId: listing.id, isNew });

  return { id: listing.id, isNew, vehicleId };
}

function startListingWorker() {
  const deps = { cache: createDbCache(), openai: createOpenAiTranslator() };
  const telegram = createTelegram();
  listingQueue.process(
    JOB_CRAWL_LISTING,
    Number(process.env.WORKER_CONCURRENCY || process.env.CRAWLER_LISTING_CONCURRENCY || 2),
    job => processListingJob(job, { deps, telegram })
  );
  return listingQueue;
}

module.exports = {
  processListingJob,
  startListingWorker,
};

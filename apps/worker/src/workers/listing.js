import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { attachRedisErrorHandler, createRedisConnection, QUEUE_LISTING, debugLog } from "@jdm-pro/shared";
import { createDbCache, createOpenAiTranslator } from "@jdm-pro/lookup";
import { getAdapter } from "@jdm-pro/crawler";
import { fetchDocument } from "@jdm-pro/crawler/browser";
import { upsertListing } from "../ingest/upsert.js";
import { notifyMatches } from "../ingest/notify.js";
import { createTelegram } from "../telegram.js";
import { mirrorListingPhotos } from "../s3/images.js";
import { createVehicleFromListing } from "../importVehicle.js";

export async function processListingJob(
  db,
  job,
  {
    deps,
    telegram = createTelegram(),
    getAdapterImpl = getAdapter,
    fetchDocumentImpl = fetchDocument,
    mirrorListingPhotosImpl = mirrorListingPhotos,
    upsertListingImpl = upsertListing,
    notifyMatchesImpl = notifyMatches,
    createVehicleFromListingImpl = createVehicleFromListing,
  } = {}
) {
  const lookupDeps = deps || { cache: createDbCache(db), openai: createOpenAiTranslator() };
  const { site, url, presetId } = job.data || {};
  debugLog("worker.listing.job.start", { id: job.id, name: job.name, site, url, presetId });

  const adapter = getAdapterImpl(site);
  debugLog("worker.listing.adapter.selected", { id: job.id, site: adapter.site });

  const doc = await fetchDocumentImpl(url, { charset: adapter.listingCharset });
  debugLog("worker.listing.document.fetched", { id: job.id, site, url });

  const parsed = await adapter.parseListingPage(doc, url, lookupDeps);
  debugLog("worker.listing.parsed", {
    id: job.id,
    site,
    sourceListingId: parsed.sourceListingId,
    maker: parsed.maker,
    model: parsed.model,
    totalPrice: parsed.totalPrice,
    photoCount: parsed.photos?.length || 0,
  });

  const canonical = await mirrorListingPhotosImpl(parsed);
  debugLog("worker.listing.photos.mirrored", {
    id: job.id,
    site,
    sourceListingId: canonical.sourceListingId,
    photoCount: canonical.photos?.length || 0,
  });

  const { listing, isNew } = await upsertListingImpl(db, canonical);
  debugLog("worker.listing.upserted", {
    id: job.id,
    listingId: listing.id,
    sourceListingId: listing.sourceListingId,
    isNew,
  });

  // Evaluate matches on every crawl, not just first insert — listings that already existed
  // (e.g. crawled before the preset was created) must still notify. notifyMatches dedupes
  // on (listingId, presetId), so repeat crawls never create duplicates or re-send telegram.
  await notifyMatchesImpl(listing, { db, telegram });

  let vehicleId = null;
  if (presetId) {
    const [preset] = await db
      .select()
      .from(schema.filterPresets)
      .where(eq(schema.filterPresets.id, presetId))
      .limit(1);
    if (preset?.autoCreateVehicles) {
      const { vehicle, created } = await createVehicleFromListingImpl(db, listing);
      vehicleId = vehicle.id;
      debugLog("worker.listing.vehicleImported", { id: job.id, listingId: listing.id, vehicleId, created, presetId });
    }
  }

  debugLog("worker.listing.job.done", { id: job.id, listingId: listing.id, isNew });

  return { id: listing.id, isNew, vehicleId };
}

export function startListingWorker({ db }) {
  const deps = { cache: createDbCache(db), openai: createOpenAiTranslator() };
  const telegram = createTelegram();
  const connection = createRedisConnection("worker:listing-client");
  const worker = new Worker(QUEUE_LISTING, (job) => processListingJob(db, job, { deps, telegram }), {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || process.env.CRAWLER_LISTING_CONCURRENCY || 2),
  });
  return attachRedisErrorHandler(worker, "worker:listing");
}

import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import {
  createRedisConnection,
  attachRedisErrorHandler,
  QUEUE_DISCOVERY,
  JOB_DISCOVER_PRESET,
  JOB_DISCOVER_SITE,
  JOB_CRAWL_LISTING,
  debugLog,
} from "@jdm-pro/shared";
import { getAdapter } from "@jdm-pro/crawler";
import { fetchDocument } from "@jdm-pro/crawler/browser";
import { markMisses } from "../ingest/soldDetection.js";
import { fanOutPreset } from "../scheduler.js";
import { discoveryQueue, listingQueue, defaultJobOpts } from "../queues.js";

const MAX_PAGES = Number(process.env.CRAWLER_MAX_PAGES || 10);

export async function processDiscoverySiteJob(
  db,
  job,
  { getAdapterImpl = getAdapter, fetchDocumentImpl = fetchDocument, markMissesImpl = markMisses } = {}
) {
  const { presetId, site, criteria } = job.data || {};
  const adapter = getAdapterImpl(site);
  const [run] = await db
    .insert(schema.crawlRuns)
    .values({ presetId: presetId || null, site, status: "running" })
    .returning();
  debugLog("worker.discovery.run.created", { jobId: job.id, runId: run.id, presetId, site, criteria });

  const seen = new Set();
  let url = adapter.buildSearchUrl(criteria || {});
  let pages = 0;

  try {
    while (url && pages < MAX_PAGES) {
      debugLog("worker.discovery.page.fetch", { jobId: job.id, site, page: pages + 1, url });
      const doc = await fetchDocumentImpl(url, { charset: adapter.searchCharset });
      const { listingRefs, nextPageUrl } = adapter.parseSearchPage(doc);
      debugLog("worker.discovery.page.parsed", {
        jobId: job.id,
        site,
        page: pages + 1,
        listingRefCount: listingRefs.length,
        nextPageUrl,
      });

      for (const ref of listingRefs) {
        if (seen.has(ref.sourceListingId)) continue;
        seen.add(ref.sourceListingId);
        await listingQueue.add(JOB_CRAWL_LISTING, { site, url: ref.url, presetId: presetId || null }, defaultJobOpts);
        debugLog("worker.discovery.listing.queued", { jobId: job.id, site, sourceListingId: ref.sourceListingId, url: ref.url });
      }

      url = nextPageUrl;
      pages += 1;
    }

    await markMissesImpl(db, site, seen);
    await db
      .update(schema.crawlRuns)
      .set({ status: "done", foundCount: seen.size, finishedAt: new Date() })
      .where(eq(schema.crawlRuns.id, run.id));
    if (presetId) {
      await db.update(schema.filterPresets).set({ lastRunAt: new Date() }).where(eq(schema.filterPresets.id, presetId));
    }
    debugLog("worker.discovery.run.done", { jobId: job.id, runId: run.id, presetId, site, pages, found: seen.size });
    return { found: seen.size };
  } catch (error) {
    await db
      .update(schema.crawlRuns)
      .set({ status: "error", errorCount: 1, finishedAt: new Date() })
      .where(eq(schema.crawlRuns.id, run.id));
    debugLog("worker.discovery.run.error", {
      jobId: job.id,
      runId: run.id,
      presetId,
      site,
      pages,
      found: seen.size,
      message: error?.message || String(error),
    });
    throw error;
  }
}

export async function processDiscoveryJob(db, job) {
  debugLog("worker.discovery.job.start", { id: job.id, name: job.name, data: job.data });
  if (job.name === JOB_DISCOVER_PRESET) return fanOutPreset(job);
  if (job.name === JOB_DISCOVER_SITE) return processDiscoverySiteJob(db, job);
  throw new Error(`Unknown discovery job: ${job.name}`);
}

export function startDiscoveryWorker({ db }) {
  const connection = createRedisConnection("worker:discovery-client");
  const worker = new Worker(QUEUE_DISCOVERY, (job) => processDiscoveryJob(db, job), {
    connection,
    concurrency: Number(process.env.CRAWLER_DISCOVERY_CONCURRENCY || 1),
  });
  return attachRedisErrorHandler(worker, "worker:discovery");
}

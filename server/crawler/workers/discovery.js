const { CrawlRun, FilterPreset } = require('../../../db/models');
const { getAdapter } = require('../adapters');
const { fetchDocument } = require('../browser');
const { markMisses } = require('../ingest/sold-detection');
const { fanOutPreset } = require('../scheduler');
const { debugLog } = require('../shared/debug');
const {
  discoveryQueue,
  listingQueue,
  defaultJobOpts,
  JOB_DISCOVER_PRESET,
  JOB_DISCOVER_SITE,
  JOB_CRAWL_LISTING,
} = require('../../queues/crawler');

const MAX_PAGES = Number(process.env.CRAWLER_MAX_PAGES || 10);

async function processDiscoverySiteJob(job, { getAdapterImpl = getAdapter, fetchDocumentImpl = fetchDocument, markMissesImpl = markMisses } = {}) {
  const { presetId, site, criteria } = job.data || {};
  const adapter = getAdapterImpl(site);
  const run = await CrawlRun.create({ presetId: presetId || null, site, status: 'running' });
  debugLog('worker.discovery.run.created', { jobId: job.id, runId: run.id, presetId, site, criteria });

  const seen = new Set();
  let url = adapter.buildSearchUrl(criteria || {});
  let pages = 0;

  try {
    while (url && pages < MAX_PAGES) {
      debugLog('worker.discovery.page.fetch', { jobId: job.id, site, page: pages + 1, url });
      const doc = await fetchDocumentImpl(url, { charset: adapter.searchCharset });
      const { listingRefs, nextPageUrl } = adapter.parseSearchPage(doc);
      debugLog('worker.discovery.page.parsed', {
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
        debugLog('worker.discovery.listing.queued', { jobId: job.id, site, sourceListingId: ref.sourceListingId, url: ref.url });
      }

      url = nextPageUrl;
      pages += 1;
    }

    await markMissesImpl(site, seen);
    await run.update({ status: 'done', foundCount: seen.size, finishedAt: new Date() });
    if (presetId) await FilterPreset.update({ lastRunAt: new Date() }, { where: { id: presetId } });
    debugLog('worker.discovery.run.done', { jobId: job.id, runId: run.id, presetId, site, pages, found: seen.size });
    return { found: seen.size };
  } catch (error) {
    await run.update({ status: 'error', errorCount: 1, finishedAt: new Date() });
    debugLog('worker.discovery.run.error', {
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

async function processDiscoveryJob(job) {
  debugLog('worker.discovery.job.start', { id: job.id, name: job.name, data: job.data });
  if (job.name === JOB_DISCOVER_PRESET) return fanOutPreset(job);
  if (job.name === JOB_DISCOVER_SITE) return processDiscoverySiteJob(job);
  throw new Error(`Unknown discovery job: ${job.name}`);
}

function startDiscoveryWorker() {
  discoveryQueue.process(JOB_DISCOVER_PRESET, Number(process.env.CRAWLER_DISCOVERY_CONCURRENCY || 1), processDiscoveryJob);
  discoveryQueue.process(JOB_DISCOVER_SITE, Number(process.env.CRAWLER_DISCOVERY_CONCURRENCY || 1), processDiscoveryJob);
  return discoveryQueue;
}

module.exports = {
  processDiscoveryJob,
  processDiscoverySiteJob,
  startDiscoveryWorker,
};

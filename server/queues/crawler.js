const Queue = require('bull');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const QUEUE_DISCOVERY = 'discovery';
const QUEUE_LISTING = 'listing';

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const discoveryQueue = new Queue(QUEUE_DISCOVERY, redisUrl, {
  defaultJobOptions: defaultJobOpts,
});

const listingQueue = new Queue(QUEUE_LISTING, redisUrl, {
  defaultJobOptions: defaultJobOpts,
});

module.exports = {
  QUEUE_DISCOVERY,
  QUEUE_LISTING,
  discoveryQueue,
  listingQueue,
  defaultJobOpts,
  JOB_DISCOVER_PRESET: 'discover-preset',
  JOB_DISCOVER_SITE: 'discover-site',
  JOB_CRAWL_LISTING: 'crawl-listing',
  SITES: ['goonet', 'carsensor'],
};

require('dotenv').config();

const { sequelize } = require('../../db/models');
const { closeBrowser } = require('../crawler/browser');
const { startListingWorker, processListingJob } = require('../crawler/workers/listing');
const { startDiscoveryWorker, processDiscoveryJob } = require('../crawler/workers/discovery');
const { syncSchedules } = require('../crawler/scheduler');
const { discoveryQueue, listingQueue } = require('../queues/crawler');

async function start() {
  startListingWorker();
  startDiscoveryWorker();
  const scheduled = await syncSchedules();
  console.log(`crawler worker started; scheduled presets: ${scheduled}`);
}

async function shutdown(signal) {
  console.log(`crawler worker received ${signal}, shutting down`);
  await Promise.allSettled([listingQueue.close(), discoveryQueue.close(), closeBrowser(), sequelize.close()]);
  process.exit(0);
}

if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  start().catch(error => {
    console.error('crawler worker failed to start', error);
    process.exit(1);
  });
}

module.exports = {
  start,
  shutdown,
  processListingJob,
  processDiscoveryJob,
  syncSchedules,
};

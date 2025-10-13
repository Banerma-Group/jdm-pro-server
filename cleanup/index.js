const Promise = require('bluebird');
const { Load } = require('../db/models');

const BATCH_SIZE = 20;

async function updateLoads(query = {}, processor = function () {}) {
  let offset = 0;
  let limit = query.limit || BATCH_SIZE;
  let continueProcessing = true;

  while (continueProcessing) {
    console.log(`Processing batch starting from offset ${offset}`);
    // Fetch a batch of DocumentNodes
    const loads = await Load.findAll({
      limit,
      offset,
      order: [['created_at', 'DESC']],
      raw: true,
      ...query,
    });

    if (loads.length === 0) {
      continueProcessing = false;
      break;
    }

    console.log(`Processing ${loads.length} loads`);

    await Promise.map(loads, processor, { concurrency: limit > 5 ? 5 : limit });

    offset += limit;
    console.log(`Completed processing batch up to offset ${offset}`);
  }

  console.log('All Loads nodes updated successfully.');
}

module.exports = { updateLoads };

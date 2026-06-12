const goonet = require('./goonet');
const carsensor = require('./carsensor');

const adapters = {
  goonet,
  carsensor,
};

function getAdapter(site) {
  const adapter = adapters[site];
  if (!adapter) throw new Error(`Unknown crawler site: ${site}`);
  return adapter;
}

function getAdapterForUrl(url) {
  return Object.values(adapters).find(adapter => adapter.detectFromUrl(url)) || null;
}

module.exports = {
  adapters,
  goonet,
  carsensor,
  getAdapter,
  getAdapterForUrl,
};

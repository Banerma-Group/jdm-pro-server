import goonet from "./goonet.js";
import carsensor from "./carsensor.js";

export const adapters = {
  goonet,
  carsensor,
};

export function getAdapter(site) {
  const adapter = adapters[site];
  if (!adapter) throw new Error(`Unknown crawler site: ${site}`);
  return adapter;
}

export function getAdapterForUrl(url) {
  return Object.values(adapters).find((adapter) => adapter.detectFromUrl(url)) || null;
}

export { goonet, carsensor };

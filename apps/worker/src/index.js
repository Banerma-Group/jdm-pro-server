import { createDb } from "@jdm-pro/db";
import { closeBrowser } from "@jdm-pro/crawler/browser";
import { startListingWorker } from "./workers/listing.js";
import { startDiscoveryWorker } from "./workers/discovery.js";
import { syncSchedules } from "./scheduler.js";

const { db, sql } = createDb();

const listingWorker = startListingWorker({ db });
const discoveryWorker = startDiscoveryWorker({ db });
const scheduled = await syncSchedules(db);

console.log(`crawler worker started; scheduled presets: ${scheduled}`);

async function shutdown(signal) {
  console.log(`crawler worker received ${signal}, shutting down`);
  await Promise.allSettled([listingWorker.close(), discoveryWorker.close(), closeBrowser(), sql.end()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

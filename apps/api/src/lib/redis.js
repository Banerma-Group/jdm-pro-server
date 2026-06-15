import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_RETRY_DELAY_MS = 2000;

// Shared lightweight client for ephemeral key/value work (rate limiting,
// Telegram connect tokens, web-device sessions). BullMQ manages its own
// connections in apps/worker; this is separate.
let client;

export function getRedis() {
  if (!client) {
    client = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: () => REDIS_RETRY_DELAY_MS,
    });
    client.on("error", (error) => {
      console.error("[redis] connection error:", error?.message || error);
    });
  }
  return client;
}

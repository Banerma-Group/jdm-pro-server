import IORedis from "ioredis";

const REDIS_RETRY_DELAY_MS = 2000;

export function createRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: () => REDIS_RETRY_DELAY_MS,
  });
  client.on("error", (error) => {
    console.error("[redis] connection error:", error?.message || error);
  });
  return client;
}

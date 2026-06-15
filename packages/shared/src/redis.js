import IORedis from "ioredis";

const REDIS_RETRY_DELAY_MS = 2000;

export function redisEndpointLabel(url = process.env.REDIS_URL ?? "redis://localhost:6379") {
  try {
    const parsed = new URL(url);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return `${parsed.protocol}//${host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "[invalid redis url]";
  }
}

export function attachRedisErrorHandler(emitter, label = "client", url = process.env.REDIS_URL ?? "redis://localhost:6379") {
  emitter.on("error", (error) => {
    const message = error?.message || String(error);
    console.error(`[redis:${label}] connection error: ${message}; endpoint=${redisEndpointLabel(url)}`);
  });
  return emitter;
}

export function createRedisConnection(label = "client") {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: () => REDIS_RETRY_DELAY_MS,
  });
  return attachRedisErrorHandler(client, label, url);
}

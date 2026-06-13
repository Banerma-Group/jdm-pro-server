const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Shared connection for ephemeral key/value work (e.g. Telegram connect tokens).
// Bull manages its own connections in server/queues; this is a separate lightweight client.
let client;

function getRedis() {
  if (!client) {
    client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return client;
}

module.exports = { getRedis };

const redis = require('./redis'); // same client you use elsewhere
const WEEK = 7 * 24 * 60 * 60;
const KEY = userId => `logistics-bot:${userId}:${userId}`;

// get session object (or null)
async function getSessionObj(userId) {
  const raw = await redis.get(KEY(userId));
  return raw ? JSON.parse(raw) : null;
}

// write session object back, preserving existing TTL when possible
async function writeSessionObj(userId, obj) {
  const key = KEY(userId);
  let ttl = await redis.ttl(key); // -2 = no key, -1 = no expire, >0 = seconds
  if (ttl <= 0) ttl = WEEK; // default if missing/no-expire
  return redis.setex(key, ttl, JSON.stringify(obj));
}

module.exports = {
  KEY,
  async getSession(userId) {
    return (await getSessionObj(userId)) || {};
  },
  async setWebDeviceId(userId, deviceId) {
    const obj = (await getSessionObj(userId)) || {};
    obj.webDeviceId = deviceId;
    await writeSessionObj(userId, obj);
  },
  async setWebLockUntil(userId, untilTs) {
    const o = (await getSessionObj(userId)) || {};
    o.webLockUntil = untilTs;
    await writeSessionObj(userId, o);
  },
};

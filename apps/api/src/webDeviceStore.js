import { getRedis } from "./lib/redis.js";

const WEEK = 7 * 24 * 60 * 60;
const KEY = (userId) => `logistics-bot:${userId}:${userId}`;

async function getSessionObj(userId) {
  const raw = await getRedis().get(KEY(userId));
  return raw ? JSON.parse(raw) : null;
}

async function writeSessionObj(userId, obj) {
  const redis = getRedis();
  const key = KEY(userId);
  let ttl = await redis.ttl(key); // -2 = no key, -1 = no expire, >0 = seconds
  if (ttl <= 0) ttl = WEEK;
  return redis.setex(key, ttl, JSON.stringify(obj));
}

export async function getSession(userId) {
  return (await getSessionObj(userId)) || {};
}

export async function setWebDeviceId(userId, deviceId) {
  const obj = (await getSessionObj(userId)) || {};
  obj.webDeviceId = deviceId;
  await writeSessionObj(userId, obj);
}

export async function setWebLockUntil(userId, untilTs) {
  const obj = (await getSessionObj(userId)) || {};
  obj.webLockUntil = untilTs;
  await writeSessionObj(userId, obj);
}

// Device guard: returns a 401 reason when the request's device id conflicts with
// the stored web session. Preserved from the old middleware; effectively inert
// because the User model has no telegramId, so userTelegramId is undefined.
export async function deviceConflict(request, ctx) {
  const userTelegramId = ctx.user?.telegramId;
  const platform = request.headers.get("x-device-platform");
  const headerDeviceId = request.headers.get("x-device-id");
  if (platform && userTelegramId && headerDeviceId) {
    const session = await getSession(userTelegramId);
    if (session.webDeviceId && session.webDeviceId !== headerDeviceId) return true;
  }
  return false;
}

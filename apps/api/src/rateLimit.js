import { getRedis } from "./lib/redis.js";
import { json, clientIp } from "./json.js";

// Fixed-window limiter backed by Redis INCR + PEXPIRE. Replaces the old
// express-rate-limit + rate-limit-redis with the same keying:
//   user-<id>  ->  auth-<base64url token>  ->  ip-<client ip>
// and the same smartRateLimit({authMax, anonMax}) auth/anon split.
function rateKey(request, ctx) {
  if (ctx.user?.id) return `user-${ctx.user.id}`;
  const auth = request.headers.get("authorization");
  if (auth) return `auth-${Buffer.from(auth).toString("base64url")}`;
  return `ip-${clientIp(request)}`;
}

export async function rateLimit(request, ctx, { authMax = 200, anonMax = 50, windowMs = 60 * 1000 } = {}) {
  const isAuthenticated = !!ctx.user;
  const max = isAuthenticated ? authMax : anonMax;
  const redis = getRedis();
  const key = `ratelimit:${rateKey(request, ctx)}`;

  let count;
  try {
    count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);
  } catch {
    // Fail open if Redis is unavailable (old store would also degrade).
    return null;
  }

  if (count > max) {
    const message = isAuthenticated ? "Too many requests (logged in)" : "Too many requests (anonymous)";
    const retryAfter = Math.ceil(windowMs / 1000);
    return json({ error: message }, 429, { "Retry-After": String(retryAfter) });
  }
  return null;
}

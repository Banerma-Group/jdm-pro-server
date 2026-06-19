import jwt from "jsonwebtoken";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, parseCookies } from "./json.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// NOTE: preserves the old getAuthToken behavior exactly, including expiresIn
// being passed the millisecond WEEK value (jwt treats a numeric expiresIn as
// seconds, so tokens are effectively very long-lived — unchanged on purpose).
export function getAuthToken(userId) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: WEEK_MS });
  return { token, userId, expires: new Date(Date.now() + WEEK_MS) };
}

export function verifyTelegramAuth(data, botToken) {
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const { hash, ...authData } = data;
  const checkString = Object.keys(authData)
    .sort()
    .map((key) => `${key}=${authData[key]}`)
    .join("\n");
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return hmac === hash;
}

function readToken(request, url) {
  return request.headers.get("authorization") || url.searchParams.get("auth");
}

// Builds the per-request context: { user, locale, sessionId, newSession, authFailed }.
// Mirrors the old jwt-auth + locale/session middleware. authFailed is true only
// when a VALID token resolves to a user that no longer exists (old behavior: 401).
export async function buildContext(db, request, url) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const locale = request.headers.get("user-locale") || "uz";
  let sessionId = cookies["session-id"];
  let newSession = false;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    newSession = true;
  }

  const raw = readToken(request, url);
  let user = null;
  let authFailed = false;
  if (raw) {
    let payload;
    try {
      payload = jwt.verify(raw.replace("Bearer ", ""), process.env.JWT_SECRET);
    } catch {
      // invalid/expired token -> treated as anonymous (old behavior)
    }
    if (payload?.userId) {
      const [found] = await db.select().from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1);
      if (found) {
        const { salt, hash, ...safe } = found;
        user = safe;
      } else {
        authFailed = true; // valid token, missing user -> 401
      }
    }
  }

  return { user, locale, sessionId, newSession, authFailed };
}

// Replaces ensure-auth: returns a 401/403 Response when not allowed, else null.
export function requireAuth(ctx, ...roles) {
  if (ctx.user) {
    if (ctx.user.isBlocked) return json({ error: "errors.user-blocked" }, 403);
    if (!roles.length || roles.some((role) => ctx.user.role === role)) return null;
  }
  return json({ error: "Unauthorized" }, 401);
}

export function sessionCookie(sessionId) {
  // httpOnly, secure, sameSite=lax, 1 week — same as the old res.cookie.
  const maxAge = Math.floor(WEEK_MS / 1000);
  return `session-id=${encodeURIComponent(sessionId)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

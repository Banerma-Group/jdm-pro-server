import { createDb } from "@jdm-pro/db";
import { debugLog } from "@jdm-pro/shared";
import { json, text } from "./json.js";
import { corsHeaders, preflight } from "./cors.js";
import { buildContext, sessionCookie } from "./auth.js";
import { deviceConflict } from "./webDeviceStore.js";

const port = Number(process.env.PORT ?? 3000);
const { db } = createDb();

// Public routes (no device guard, e.g. /api/auth). Populated in Stage 6.
const publicRoutes = [];
// Everything else under /api (device guard applies). Populated in Stage 6.
const guardedRoutes = [];

// Single place that adds CORS + the rolling session-id cookie to every response.
function decorate(res, request, ctx) {
  for (const [key, value] of Object.entries(corsHeaders(request))) res.headers.set(key, value);
  if (ctx?.newSession) res.headers.append("Set-Cookie", sessionCookie(ctx.sessionId));
  return res;
}

function errorResponse(err, request, ctx) {
  const status = err?.status && Number(err.status) ? Number(err.status) : 500;
  debugLog("api.route.error", { method: request.method, message: err?.message ?? String(err), status });
  if (status >= 500) {
    if (process.env.NODE_ENV === "production") return decorate(json(undefined, 500), request, ctx);
    return decorate(json({ error: String(err?.message ?? err) }, 500), request, ctx);
  }
  return decorate(json({ error: String(err?.message ?? err) }, status), request, ctx);
}

const server = Bun.serve({
  port,
  idleTimeout: 60,
  async fetch(request) {
    const url = new URL(request.url);
    debugLog("api.request", { method: request.method, pathname: url.pathname });

    if (request.method === "OPTIONS") return preflight(request);
    if (request.method === "GET" && url.pathname === "/health") {
      return text("Bot and webhook are ready to receive traffic");
    }

    let ctx;
    try {
      ctx = await buildContext(db, request, url);
    } catch (err) {
      return errorResponse(err, request, {});
    }
    if (ctx.authFailed) return decorate(json({ error: "Unauthorized" }, 401), request, ctx);

    try {
      for (const route of publicRoutes) {
        const res = await route(db, request, url, ctx);
        if (res) return decorate(res, request, ctx);
      }

      // Device guard applies to all /api/* except the public auth routes above.
      if (url.pathname.startsWith("/api") && (await deviceConflict(request, ctx))) {
        return decorate(json({ error: "Unauthorized" }, 401), request, ctx);
      }

      for (const route of guardedRoutes) {
        const res = await route(db, request, url, ctx);
        if (res) return decorate(res, request, ctx);
      }
    } catch (err) {
      return errorResponse(err, request, ctx);
    }

    return decorate(json({ error: "Not found" }, 404), request, ctx);
  },
});

console.log(`jdm-pro API listening on http://localhost:${server.port}`);

process.on("unhandledRejection", (reason) => debugLog("api.unhandledRejection", { message: String(reason) }));

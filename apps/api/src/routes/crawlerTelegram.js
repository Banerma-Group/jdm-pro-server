import { eq, desc } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json } from "../json.js";
import { rateLimit } from "../rateLimit.js";
import { createConnectToken, getConnectToken } from "../lib/telegramConnect.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{32}$/i;
const CONN_RE = /^\/api\/crawler\/telegram\/connections\/([^/]+)$/;
const TOKEN_PATH_RE = /^\/api\/crawler\/telegram\/connect-token\/([^/]+)$/;

function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || "";
}

export async function crawlerTelegramRoutes(db, request, url, ctx) {
  if (!url.pathname.startsWith("/api/crawler/telegram")) return null;

  const limited = await rateLimit(request, ctx, { authMax: 300, anonMax: 30 });
  if (limited) return limited;

  if (url.pathname === "/api/crawler/telegram/connect-token" && request.method === "POST") {
    const token = await createConnectToken();
    const username = botUsername();
    return json({ token, deepLink: username ? `https://t.me/${username}?start=${token}` : null });
  }

  const tokenMatch = url.pathname.match(TOKEN_PATH_RE);
  if (tokenMatch && request.method === "GET") {
    const token = tokenMatch[1];
    if (!TOKEN_RE.test(token)) return json({ error: "not found" }, 404);
    const state = await getConnectToken(token);
    if (!state) return json({ status: "expired" });
    if (state.status !== "connected") return json({ status: "pending" });
    let connection = null;
    if (state.connectionId) {
      [connection] = await db
        .select()
        .from(schema.telegramConnections)
        .where(eq(schema.telegramConnections.id, state.connectionId))
        .limit(1);
    }
    return json({ status: "connected", connection: connection || null });
  }

  if (url.pathname === "/api/crawler/telegram/connections" && request.method === "GET") {
    const rows = await db.select().from(schema.telegramConnections).orderBy(desc(schema.telegramConnections.createdAt));
    return json(rows);
  }

  const connMatch = url.pathname.match(CONN_RE);
  if (connMatch && request.method === "DELETE") {
    const id = connMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const deleted = await db
      .delete(schema.telegramConnections)
      .where(eq(schema.telegramConnections.id, id))
      .returning({ id: schema.telegramConnections.id });
    if (!deleted.length) return json({ error: "not found" }, 404);
    return json({ ok: true });
  }

  return null;
}

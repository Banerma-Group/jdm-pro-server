import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json } from "../json.js";
import { requireAuth } from "../auth.js";

const USERS_RE = /^\/api\/users\/([^/]+)$/;

// Mirrors old users.js: GET /api/users/:id (auth required). Self sees all
// columns (minus salt/hash, already stripped in buildContext); others exclude email.
export async function usersRoutes(db, request, url, ctx) {
  const match = url.pathname.match(USERS_RE);
  if (!match || request.method !== "GET") return null;

  const denied = requireAuth(ctx);
  if (denied) return denied;

  const id = Number(match[1]);
  if (!Number.isFinite(id)) return json({ error: "not found" }, 404);

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) return new Response(null, { status: 404 });

  const { salt, hash, ...rest } = user;
  const isSelf = String(ctx.user.id) === String(id);
  if (!isSelf) delete rest.email;

  return json({ data: rest });
}

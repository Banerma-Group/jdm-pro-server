import { eq, or, ilike, count } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, body } from "../json.js";
import { deserialize } from "../serialize.js";
import { parseListQuery, orderColumn, listWhere } from "../util/listQuery.js";
import { pagination } from "../util/pagination.js";
import { attachAudit, coerceDates, pick } from "../util/audit.js";

const ID_RE = /^\/api\/services\/([^/]+)$/;
const COLUMNS = ["title", "description", "icon", "slug", "locale", "publishedAt"];
const FILTERS = [
  { param: "id", type: "number" },
  "title",
  "icon",
  "slug",
  "locale",
  { param: "publishedAt", type: "date" },
  { param: "createdById", type: "number" },
  { param: "updatedById", type: "number" },
];

export async function servicesRoutes(db, request, url, ctx) {
  if (url.pathname === "/api/services" && request.method === "GET") {
    const { limit, offset, sort, order, search } = parseListQuery(url);
    const locale = url.searchParams.get("locale") || ctx.locale;
    const searchWhere = search
      ? or(ilike(schema.services.title, `%${search}%`), ilike(schema.services.slug, `%${search}%`), ilike(schema.services.icon, `%${search}%`))
      : undefined;
    const localeWhere = locale ? eq(schema.services.locale, locale) : undefined;
    const where = listWhere(schema.services, url, FILTERS, [localeWhere, searchWhere]);
    const rows = await db
      .select()
      .from(schema.services)
      .where(where)
      .orderBy(orderColumn(schema.services, sort, order))
      .limit(limit)
      .offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(schema.services).where(where);
    await attachAudit(db, rows);
    return json({ data: rows, pagination: pagination(limit, offset, Number(total)) });
  }

  if (url.pathname === "/api/services" && request.method === "POST") {
    const data = coerceDates(await deserialize(await body(request)));
    const values = pick(data, COLUMNS);
    values.createdById = ctx.user?.id || null;
    const [created] = await db.insert(schema.services).values(values).returning();
    return json({ data: created }, 201);
  }

  const match = url.pathname.match(ID_RE);
  if (!match) return null;
  const id = Number(match[1]);

  if (request.method === "GET") {
    const [row] = await db.select().from(schema.services).where(eq(schema.services.id, id)).limit(1);
    if (!row) return new Response(null, { status: 404 });
    await attachAudit(db, [row]);
    return json({ data: row });
  }

  if (request.method === "PATCH") {
    const [exists] = await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.id, id)).limit(1);
    if (!exists) return new Response(null, { status: 404 });
    const data = coerceDates(await deserialize(await body(request)));
    const values = pick(data, COLUMNS);
    values.updatedById = ctx.user?.id || null;
    values.updatedAt = new Date();
    const [row] = await db.update(schema.services).set(values).where(eq(schema.services.id, id)).returning();
    return json({ data: row });
  }

  if (request.method === "DELETE") {
    const deleted = await db.delete(schema.services).where(eq(schema.services.id, id)).returning({ id: schema.services.id });
    if (!deleted.length) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  }

  return null;
}

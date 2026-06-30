import { asc, eq, or, ilike, count } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, body } from "../json.js";
import { parseListQuery, orderColumn, listWhere } from "../util/listQuery.js";
import { pagination } from "../util/pagination.js";
import { coerceDates, pick } from "../util/audit.js";

const ID_RE = /^\/api\/markets\/([^/]+)$/;
const COLUMNS = ["name", "slug", "sortOrder"];

function numericId(value) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

export function marketLookupWhere(identifier) {
  const id = numericId(identifier);
  return id != null ? eq(schema.markets.id, id) : eq(schema.markets.slug, identifier);
}

export async function marketsRoutes(db, request, url) {
  if (url.pathname === "/api/markets" && request.method === "GET") {
    const { limit, offset, sort, order, search } = parseListQuery(url);
    const orderBy = url.searchParams.has("sort")
      ? [orderColumn(schema.markets, sort, order, schema.markets.sortOrder)]
      : [asc(schema.markets.sortOrder), asc(schema.markets.name)];
    const searchWhere = search
      ? or(ilike(schema.markets.name, `%${search}%`), ilike(schema.markets.slug, `%${search}%`))
      : undefined;
    const where = listWhere(schema.markets, url, [searchWhere]);
    const rows = await db
      .select()
      .from(schema.markets)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(schema.markets).where(where);
    return json({ data: rows, pagination: pagination(limit, offset, Number(total)) });
  }

  if (url.pathname === "/api/markets" && request.method === "POST") {
    const data = coerceDates(await body(request));
    const values = pick(data, COLUMNS);
    const [created] = await db.insert(schema.markets).values(values).returning();
    return json({ data: created }, 201);
  }

  const match = url.pathname.match(ID_RE);
  if (!match) return null;
  const identifier = decodeURIComponent(match[1]);
  const id = numericId(identifier);

  if (request.method === "GET") {
    const [row] = await db.select().from(schema.markets).where(marketLookupWhere(identifier)).limit(1);
    if (!row) return new Response(null, { status: 404 });
    return json({ data: row });
  }

  if (request.method === "PATCH") {
    if (id == null) return new Response(null, { status: 404 });
    const data = coerceDates(await body(request));
    const values = pick(data, COLUMNS);
    values.updatedAt = new Date();
    const [row] = await db.update(schema.markets).set(values).where(eq(schema.markets.id, id)).returning();
    if (!row) return new Response(null, { status: 404 });
    return json({ data: row });
  }

  if (request.method === "DELETE") {
    if (id == null) return new Response(null, { status: 404 });
    const deleted = await db.delete(schema.markets).where(eq(schema.markets.id, id)).returning({ id: schema.markets.id });
    if (!deleted.length) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  }

  return null;
}

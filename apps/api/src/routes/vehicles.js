import { eq, inArray, count, desc, sql } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, body } from "../json.js";
import { rateLimit } from "../rateLimit.js";
import { parseListQuery, orderColumn, listWhere } from "../util/listQuery.js";
import { pagination } from "../util/pagination.js";
import { attachAudit, coerceDates, pick } from "../util/audit.js";
import * as aws from "../services/aws.js";
import { keyFromUrl } from "../util/uploads.js";
import { buildVehicleSearchWhere, vehicleSearchRank } from "../util/vehicleSearch.js";

const ID_RE = /^\/api\/vehicles\/([^/]+)$/;
const COLUMNS = [
  "make", "model", "notes", "market", "mileage", "color", "slug", "stockNumber", "status", "vin",
  "transmission", "youtubeLink", "description", "price", "isPosted", "isMain", "year",
  "locale", "publishedAt", "crawlerListingId",
];

// Attaches createdBy/updatedBy + flattened images (sort_order) + youtubeCover,
// and drops youtubeCoverId — mirrors the old toJSON flatten.
async function hydrate(db, vehicles, { keepCoverId = false } = {}) {
  if (!vehicles.length) return vehicles;
  const ids = vehicles.map((v) => v.id);

  const imgs = await db
    .select({
      vehicleId: schema.vehicleMedia.vehicleId,
      sortOrder: schema.vehicleMedia.sortOrder,
      id: schema.media.id,
      url: schema.media.url,
      name: schema.media.name,
      userId: schema.media.userId,
      createdAt: schema.media.createdAt,
      updatedAt: schema.media.updatedAt,
    })
    .from(schema.vehicleMedia)
    .innerJoin(schema.media, eq(schema.vehicleMedia.mediaId, schema.media.id))
    .where(inArray(schema.vehicleMedia.vehicleId, ids));

  const byVehicle = new Map();
  for (const im of imgs) {
    if (!byVehicle.has(im.vehicleId)) byVehicle.set(im.vehicleId, []);
    byVehicle.get(im.vehicleId).push(im);
  }

  const coverIds = [...new Set(vehicles.map((v) => v.youtubeCoverId).filter((v) => v != null))];
  const covers = coverIds.length ? await db.select().from(schema.media).where(inArray(schema.media.id, coverIds)) : [];
  // Embedded media use the old snake-case FK key (user_id).
  const coverById = new Map(
    covers.map((c) => {
      const { userId, ...rest } = c;
      return [c.id, { ...rest, user_id: userId ?? null }];
    })
  );

  await attachAudit(db, vehicles);

  for (const v of vehicles) {
    const list = (byVehicle.get(v.id) || [])
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((im) => ({
        id: im.id,
        url: im.url,
        name: im.name,
        user_id: im.userId ?? null,
        createdAt: im.createdAt,
        updatedAt: im.updatedAt,
        sort_order: im.sortOrder ?? null,
      }));
    v.images = list;
    v.youtubeCover = v.youtubeCoverId != null ? coverById.get(v.youtubeCoverId) ?? null : null;
    // List keeps youtube_cover_id (snake); detail/create/patch drop it (old behavior).
    if (keepCoverId) v.youtube_cover_id = v.youtubeCoverId ?? null;
    delete v.youtubeCoverId;
  }
  return vehicles;
}

function imageRows(vehicleId, images) {
  const seen = new Set();
  const rows = [];
  images.forEach((x, i) => {
    const mediaId = Number(x?.id);
    if (!Number.isFinite(mediaId) || seen.has(mediaId)) return;
    seen.add(mediaId);
    rows.push({ vehicleId, mediaId, sortOrder: Number(x?.sort_order ?? i + 1) });
  });
  return rows;
}

async function loadOne(db, id) {
  const [row] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
  if (!row) return null;
  await hydrate(db, [row]);
  return row;
}

function stockNumberAscNullsLast() {
  return sql`${schema.vehicles.stockNumber} ASC NULLS LAST`;
}

function featuredVehicleRank() {
  return sql`CASE WHEN ${schema.vehicles.isMain} THEN 0 ELSE 1 END`;
}

function truthySearchParam(url, params) {
  return params.some((param) => {
    const value = url.searchParams.get(param);
    return value === "true" || value === "1";
  });
}

export function vehicleListOrderBy({ search, sort, order, hasExplicitSort = false, preferMain = false } = {}) {
  const baseOrder = hasExplicitSort
    ? [orderColumn(schema.vehicles, sort, order)]
    : [stockNumberAscNullsLast()];
  const stableOrder = [...baseOrder, desc(schema.vehicles.createdAt)];
  if (preferMain) return [featuredVehicleRank(), ...stableOrder];
  return search ? [vehicleSearchRank(search), ...stableOrder] : stableOrder;
}

export async function vehiclesRoutes(db, request, url, ctx) {
  if (!url.pathname.startsWith("/api/vehicles")) return null;

  const limited = await rateLimit(request, ctx, { authMax: 150, anonMax: 15 });
  if (limited) return limited;

  // LIST
  if (url.pathname === "/api/vehicles" && request.method === "GET") {
    const { limit, offset, sort, order, search } = parseListQuery(url);
    const searchWhere = buildVehicleSearchWhere(search);
    const where = listWhere(schema.vehicles, url, [searchWhere]);
    const preferMain = truthySearchParam(url, ["isMain", "is_main"]);
    const orderBy = vehicleListOrderBy({ search, sort, order, hasExplicitSort: url.searchParams.has("sort"), preferMain });
    const rows = await db
      .select()
      .from(schema.vehicles)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(schema.vehicles).where(where);
    await hydrate(db, rows, { keepCoverId: true });
    return json({ data: rows, pagination: pagination(limit, offset, Number(total)) });
  }

  // CREATE
  if (url.pathname === "/api/vehicles" && request.method === "POST") {
    const data = coerceDates(await body(request));
    const { images = [], youtubeCover } = data;
    const values = pick(data, COLUMNS);
    values.createdById = ctx.user?.id || null;
    if (youtubeCover && youtubeCover.id) values.youtubeCoverId = youtubeCover.id;

    const created = await db.transaction(async (tx) => {
      const [vehicle] = await tx.insert(schema.vehicles).values(values).returning();
      const rows = imageRows(vehicle.id, images);
      if (rows.length) {
        await tx.delete(schema.vehicleMedia).where(eq(schema.vehicleMedia.vehicleId, vehicle.id));
        await tx.insert(schema.vehicleMedia).values(rows);
      }
      return vehicle;
    });

    const full = await loadOne(db, created.id);
    return json({ data: full }, 201);
  }

  // BULK DELETE (must be checked before the /:id matcher)
  if (url.pathname === "/api/vehicles/bulk-delete" && request.method === "POST") {
    const data = await body(request);
    const ids = data?.ids;
    if (!Array.isArray(ids) || ids.length === 0) return json({ message: "Invalid or empty IDs array" }, 400);
    const vehicles = await db.select().from(schema.vehicles).where(inArray(schema.vehicles.id, ids));
    if (!vehicles.length) return json({ message: "No vehicle found for given IDs" }, 404);
    const keys = vehicles.map((v) => keyFromUrl(v.url)).filter(Boolean);
    if (keys.length) {
      try {
        await aws.deleteObjects(keys);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("S3 bulk delete error:", err);
      }
    }
    await db.delete(schema.vehicleMedia).where(inArray(schema.vehicleMedia.vehicleId, ids));
    await db.delete(schema.vehicles).where(inArray(schema.vehicles.id, ids));
    return new Response(null, { status: 204 });
  }

  const match = url.pathname.match(ID_RE);
  if (!match) return null;
  const id = Number(match[1]);

  // GET by id
  if (request.method === "GET") {
    const full = await loadOne(db, id);
    if (!full) return new Response(null, { status: 404 });
    return json({ data: full });
  }

  // PATCH
  if (request.method === "PATCH") {
    const data = coerceDates(await body(request));
    const { images = [], youtubeCover } = data;
    const values = pick(data, COLUMNS);
    values.updatedById = ctx.user?.id || null;
    values.updatedAt = new Date();

    const result = await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
      if (!vehicle) return null;

      const previousCoverId = vehicle.youtubeCoverId;
      let newCoverId = null;
      if (youtubeCover && youtubeCover.id) {
        newCoverId = youtubeCover.id;
        values.youtubeCoverId = newCoverId;
      } else {
        values.youtubeCoverId = null;
      }

      await tx.update(schema.vehicles).set(values).where(eq(schema.vehicles.id, id));

      if (!newCoverId && previousCoverId) {
        await tx.delete(schema.media).where(eq(schema.media.id, previousCoverId));
      }

      const rows = imageRows(id, images);
      if (rows.length) {
        await tx.delete(schema.vehicleMedia).where(eq(schema.vehicleMedia.vehicleId, id));
        await tx.insert(schema.vehicleMedia).values(rows);
      }
      return vehicle;
    });

    if (!result) return json({ error: "Vehicle not found" }, 404);
    const full = await loadOne(db, id);
    return json({ data: full });
  }

  // DELETE
  if (request.method === "DELETE") {
    const deleted = await db.delete(schema.vehicles).where(eq(schema.vehicles.id, id)).returning({ id: schema.vehicles.id });
    if (!deleted.length) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  }

  return null;
}

import { or, ilike, desc, inArray, eq, count } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json } from "../json.js";
import { rateLimit } from "../rateLimit.js";
import { buildVehicleSearchWhere, vehicleSearchRank, vehicleStatusRank } from "../util/vehicleSearch.js";

const LISTING_TEXT_COLUMNS = ["maker", "model", "grade", "dealerName", "prefecture", "color", "descriptionTranslated", "descriptionOriginal"];
function ilikeAny(table, columns, term) {
  return or(...columns.map((c) => ilike(table[c], `%${term}%`)));
}

async function searchListings(db, term, limit) {
  const where = ilikeAny(schema.listings, LISTING_TEXT_COLUMNS, term);
  const rows = await db
    .select({
      id: schema.listings.id,
      source: schema.listings.source,
      maker: schema.listings.maker,
      model: schema.listings.model,
      grade: schema.listings.grade,
      modelYear: schema.listings.modelYear,
      mileageKm: schema.listings.mileageKm,
      totalPrice: schema.listings.totalPrice,
      prefecture: schema.listings.prefecture,
      status: schema.listings.status,
      photos: schema.listings.photos,
    })
    .from(schema.listings)
    .where(where)
    .orderBy(desc(schema.listings.lastSeenAt))
    .limit(limit);
  const [{ value: total }] = await db.select({ value: count() }).from(schema.listings).where(where);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      source: r.source,
      maker: r.maker,
      model: r.model,
      grade: r.grade,
      modelYear: r.modelYear,
      mileageKm: r.mileageKm,
      totalPrice: r.totalPrice != null ? Number(r.totalPrice) : null,
      prefecture: r.prefecture,
      status: r.status,
      thumbnail: Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null,
    })),
    total: Number(total),
  };
}

async function searchVehicles(db, term, limit) {
  const where = buildVehicleSearchWhere(term);
  const vehicles = await db
    .select({
      id: schema.vehicles.id,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      year: schema.vehicles.year,
      price: schema.vehicles.price,
      color: schema.vehicles.color,
      status: schema.vehicles.status,
      stockNumber: schema.vehicles.stockNumber,
      createdAt: schema.vehicles.createdAt,
    })
    .from(schema.vehicles)
    .where(where)
    .orderBy(vehicleStatusRank(), vehicleSearchRank(term), desc(schema.vehicles.createdAt))
    .limit(limit);
  const [{ value: total }] = await db.select({ value: count() }).from(schema.vehicles).where(where);

  const ids = vehicles.map((v) => v.id);
  const coverByVehicle = new Map();
  if (ids.length) {
    const images = await db
      .select({ vehicleId: schema.vehicleMedia.vehicleId, sortOrder: schema.vehicleMedia.sortOrder, url: schema.media.url })
      .from(schema.vehicleMedia)
      .innerJoin(schema.media, eq(schema.vehicleMedia.mediaId, schema.media.id))
      .where(inArray(schema.vehicleMedia.vehicleId, ids));
    for (const img of images.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
      if (!coverByVehicle.has(img.vehicleId)) coverByVehicle.set(img.vehicleId, img.url);
    }
  }

  return {
    rows: vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      price: v.price,
      color: v.color,
      status: v.status,
      stockNumber: v.stockNumber,
      thumbnail: coverByVehicle.get(v.id) ?? null,
    })),
    total: Number(total),
  };
}

// GET /api/search?q=<term>&type=vehicles|listings|both&limit=<n>
export async function searchRoutes(db, request, url, ctx) {
  if (url.pathname !== "/api/search" || request.method !== "GET") return null;

  const limited = await rateLimit(request, ctx, { authMax: 300, anonMax: 30 });
  if (limited) return limited;

  const term = (url.searchParams.get("q") || "").trim();
  const typeParam = url.searchParams.get("type");
  const type = ["vehicles", "listings", "both"].includes(typeParam) ? typeParam : "both";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 25);

  const empty = { rows: [], total: 0 };
  if (term.length < 2) {
    return json({ q: term, type, vehicles: empty, listings: empty, limit });
  }

  const [vehicles, listings] = await Promise.all([
    type === "listings" ? Promise.resolve(empty) : searchVehicles(db, term, limit),
    type === "vehicles" ? Promise.resolve(empty) : searchListings(db, term, limit),
  ]);

  return json({ q: term, type, vehicles, listings, limit });
}

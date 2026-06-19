import { eq, and, gte, lte, desc, asc, isNotNull, inArray, count } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { JOB_DISCOVER_PRESET, JOB_CRAWL_LISTING } from "@jdm-pro/shared";
import { canonicalMaker } from "@jdm-pro/lookup";
import { getAdapterForUrl } from "@jdm-pro/crawler";
import { fetchMakerOptions, makerDedupeKey } from "@jdm-pro/crawler/makers";
import { discoveryQueue, listingQueue, defaultJobOpts } from "@jdm-pro/worker/queues";
import { ensurePresetSchedule, removePresetSchedule } from "@jdm-pro/worker/scheduler";
import { createVehicleFromListing } from "@jdm-pro/worker/importVehicle";
import { translateDescription } from "@jdm-pro/worker/translateDescription";
import { json, body } from "../json.js";
import { rateLimit } from "../rateLimit.js";
import { listWhere } from "../util/listQuery.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOBS_QUEUE_TIMEOUT_MS = Number(process.env.JOBS_QUEUE_TIMEOUT_MS || 2000);

class QueueTimeoutError extends Error {
  constructor(queue) {
    super("Job queues unavailable");
    this.queue = queue;
  }
}

function withQueueTimeout(promise, queue) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new QueueTimeoutError(queue)), JOBS_QUEUE_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function normalizeNumbers(value) {
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value instanceof Date) return value;
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    if (["totalPrice", "vehiclePrice", "price"].includes(key) && raw != null) next[key] = Number(raw);
    else next[key] = normalizeNumbers(raw);
  }
  return next;
}

function toPlain(row) {
  if (!row) return row;
  const normalized = normalizeNumbers(row);
  if (normalized.vehicle?.id) normalized.vehicleId = normalized.vehicle.id;
  return normalized;
}

function makerLabel(value) {
  if (!value) return "all makers";
  return String(value)
    .split("-")
    .map((word) => (word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join("-");
}

function normalizeMakerOption(value, sites = {}) {
  const normalized = value == null || value === "" ? "" : canonicalMaker(value);
  return { value: normalized, label: makerLabel(normalized), sites };
}

function parseIntQuery(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeCriteria(criteria = {}) {
  const out = {};
  if (typeof criteria.maker === "string" && criteria.maker.trim()) out.maker = criteria.maker.trim();
  if (out.maker) out.maker = canonicalMaker(out.maker);
  for (const field of ["priceMin", "priceMax", "yearMin", "yearMax", "mileageMin", "mileageMax"]) {
    const value = parseIntQuery(criteria[field]);
    if (value != null) out[field] = value;
  }
  for (const field of ["models", "bodyTypes", "fuelTypes", "transmissions", "prefectures"]) {
    if (Array.isArray(criteria[field])) out[field] = criteria[field].filter((i) => typeof i === "string" && i.trim());
  }
  return out;
}

async function attachVehicleIds(db, listings) {
  const ids = listings.map((l) => l.id);
  if (!ids.length) return listings;
  const vehicles = await db
    .select({ id: schema.vehicles.id, crawlerListingId: schema.vehicles.crawlerListingId })
    .from(schema.vehicles)
    .where(inArray(schema.vehicles.crawlerListingId, ids));
  const byListing = new Map(vehicles.map((v) => [v.crawlerListingId, v.id]));
  for (const l of listings) {
    const vid = byListing.get(l.id);
    l.vehicle = vid ? { id: vid } : null;
  }
  return listings;
}

export async function crawlerRoutes(db, request, url, ctx) {
  if (!url.pathname.startsWith("/api/crawler") || url.pathname.startsWith("/api/crawler/telegram")) return null;

  const limited = await rateLimit(request, ctx, { authMax: 300, anonMax: 30 });
  if (limited) return limited;

  const p = url.pathname;
  const sp = url.searchParams;
  const method = request.method;

  // GET /listings
  if (p === "/api/crawler/listings" && method === "GET") {
    const conds = [];
    const between = (col, min, max) => {
      if (min != null) conds.push(gte(col, min));
      if (max != null) conds.push(lte(col, max));
    };
    between(schema.listings.totalPrice, parseIntQuery(sp.get("priceMin")), parseIntQuery(sp.get("priceMax")));
    between(schema.listings.modelYear, parseIntQuery(sp.get("yearMin")), parseIntQuery(sp.get("yearMax")));
    between(schema.listings.mileageKm, parseIntQuery(sp.get("mileageMin")), parseIntQuery(sp.get("mileageMax")));

    const limit = Math.min(parseIntQuery(sp.get("limit")) || 50, 200);
    const offset = parseIntQuery(sp.get("offset")) || 0;
    const where = listWhere(schema.listings, url, conds);

    const rows = await db
      .select()
      .from(schema.listings)
      .where(where)
      .orderBy(desc(schema.listings.lastSeenAt))
      .limit(limit)
      .offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(schema.listings).where(where);
    await attachVehicleIds(db, rows);
    return json({ rows: rows.map(toPlain), total: Number(total), limit, offset });
  }

  // GET /listings/:id
  const listingMatch = p.match(/^\/api\/crawler\/listings\/([^/]+)$/);
  if (listingMatch && method === "GET") {
    const id = listingMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id)).limit(1);
    if (!listing) return json({ error: "not found" }, 404);
    await attachVehicleIds(db, [listing]);
    const prices = await db
      .select()
      .from(schema.priceHistory)
      .where(eq(schema.priceHistory.listingId, id))
      .orderBy(asc(schema.priceHistory.observedAt));
    return json({ ...toPlain(listing), priceHistory: prices.map(toPlain) });
  }

  // POST /listings/:id/import-vehicle
  const importMatch = p.match(/^\/api\/crawler\/listings\/([^/]+)\/import-vehicle$/);
  if (importMatch && method === "POST") {
    if (!UUID_RE.test(importMatch[1])) return json({ error: "not found" }, 404);
    const { vehicle, created } = await createVehicleFromListing(db, importMatch[1]);
    return json({ data: toPlain(vehicle), created }, created ? 201 : 200);
  }

  // POST /listings/:id/translate
  const translateMatch = p.match(/^\/api\/crawler\/listings\/([^/]+)\/translate$/);
  if (translateMatch && method === "POST") {
    const id = translateMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id)).limit(1);
    if (!listing) return json({ error: "not found" }, 404);
    if (listing.descriptionTranslated) return json({ translation: listing.descriptionTranslated, cached: true });
    if (!listing.descriptionOriginal) return json({ translation: null, cached: false });
    const translation = await translateDescription(listing.descriptionOriginal);
    if (!translation) return json({ error: "translation unavailable" }, 503);
    await db.update(schema.listings).set({ descriptionTranslated: translation }).where(eq(schema.listings.id, id));
    return json({ translation, cached: false });
  }

  // GET /makers
  if (p === "/api/crawler/makers" && method === "GET") {
    const where = listWhere(schema.makers, url);
    const persisted = await db.select().from(schema.makers).where(where).orderBy(asc(schema.makers.label));
    if (persisted.length) {
      const byKey = new Map();
      for (const row of persisted) {
        const key = makerDedupeKey(row.value);
        if (!key) continue;
        const label = row.label || makerLabel(row.value);
        const existing = byKey.get(key);
        if (existing) {
          existing.sites = { ...existing.sites, ...(row.sites || {}) };
          if (!existing.label.includes("・") && label.includes("・")) existing.label = label;
        } else {
          byKey.set(key, { value: key, label, sites: row.sites || {} });
        }
      }
      const rows = [normalizeMakerOption(""), ...Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label))];
      return json({ rows });
    }
    if (where) return json({ rows: [] });

    const crawlerOptions = await fetchMakerOptions();
    if (crawlerOptions.length > 1) {
      await Promise.all(
        crawlerOptions
          .filter((o) => o.value)
          .map((o) =>
            db
              .insert(schema.makers)
              .values({ value: o.value, label: o.label, sites: o.sites || {}, updatedAt: new Date() })
              .onConflictDoUpdate({ target: schema.makers.value, set: { label: o.label, sites: o.sites || {}, updatedAt: new Date() } })
          )
      );
      return json({ rows: crawlerOptions });
    }

    const distinctMakers = await db
      .selectDistinct({ maker: schema.listings.maker })
      .from(schema.listings)
      .where(isNotNull(schema.listings.maker))
      .orderBy(asc(schema.listings.maker));
    return json({
      rows: [normalizeMakerOption(""), ...distinctMakers.map((r) => normalizeMakerOption(r.maker)).filter((o) => o.value)],
    });
  }

  // GET /facets
  if (p === "/api/crawler/facets" && method === "GET") {
    const baseWhere = listWhere(schema.listings, url);
    const FACET_COLUMNS = {
      source: schema.listings.source,
      bodyType: schema.listings.bodyType,
      fuelType: schema.listings.fuelType,
      transmission: schema.listings.transmission,
      drivetrain: schema.listings.drivetrain,
    };
    const entries = await Promise.all(
      Object.entries(FACET_COLUMNS).map(async ([field, col]) => {
        const where = baseWhere ? and(baseWhere, isNotNull(col)) : isNotNull(col);
        const rows = await db.selectDistinct({ value: col }).from(schema.listings).where(where).orderBy(asc(col));
        return [field, rows.map((r) => r.value).filter((v) => v != null && String(v).trim() !== "")];
      })
    );
    return json(Object.fromEntries(entries));
  }

  // GET /presets
  if (p === "/api/crawler/presets" && method === "GET") {
    const where = listWhere(schema.filterPresets, url);
    const rows = await db.select().from(schema.filterPresets).where(where).orderBy(desc(schema.filterPresets.createdAt));
    return json(rows.map(toPlain));
  }

  // POST /presets
  if (p === "/api/crawler/presets" && method === "POST") {
    const data = (await body(request)) || {};
    if (!data.name || typeof data.name !== "string") return json({ error: "name required" }, 400);
    const [row] = await db
      .insert(schema.filterPresets)
      .values({
        name: data.name.trim(),
        enabled: data.enabled ?? true,
        sites: Array.isArray(data.sites) && data.sites.length ? data.sites : ["goonet", "carsensor"],
        criteria: sanitizeCriteria(data.criteria),
        autoCreateVehicles: Boolean(data.autoCreateVehicles),
        telegramChatId: data.telegramChatId || null,
      })
      .returning();
    await ensurePresetSchedule(row);
    return json(toPlain(row), 201);
  }

  // /presets/:id (PATCH, DELETE) and /presets/:id/run (POST)
  const presetRun = p.match(/^\/api\/crawler\/presets\/([^/]+)\/run$/);
  if (presetRun && method === "POST") {
    const id = presetRun[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const [row] = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.id, id)).limit(1);
    if (!row) return json({ error: "not found" }, 404);
    const job = await discoveryQueue.add(
      JOB_DISCOVER_PRESET,
      { presetId: row.id, sites: row.sites, criteria: row.criteria || {} },
      defaultJobOpts
    );
    return json({ ok: true, jobId: job.id });
  }

  const presetMatch = p.match(/^\/api\/crawler\/presets\/([^/]+)$/);
  if (presetMatch && method === "PATCH") {
    const id = presetMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const [existing] = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.id, id)).limit(1);
    if (!existing) return json({ error: "not found" }, 404);
    const data = (await body(request)) || {};
    const patch = {};
    if ("name" in data) patch.name = data.name;
    if ("enabled" in data) patch.enabled = data.enabled;
    if ("sites" in data) patch.sites = data.sites;
    if ("autoCreateVehicles" in data) patch.autoCreateVehicles = Boolean(data.autoCreateVehicles);
    if ("telegramChatId" in data) patch.telegramChatId = data.telegramChatId || null;
    if ("criteria" in data) patch.criteria = sanitizeCriteria(data.criteria);
    const [row] = await db.update(schema.filterPresets).set(patch).where(eq(schema.filterPresets.id, id)).returning();
    await ensurePresetSchedule(row);
    return json(toPlain(row));
  }

  if (presetMatch && method === "DELETE") {
    const id = presetMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    await removePresetSchedule(id);
    const deleted = await db.delete(schema.filterPresets).where(eq(schema.filterPresets.id, id)).returning({ id: schema.filterPresets.id });
    if (!deleted.length) return json({ error: "not found" }, 404);
    return json({ ok: true });
  }

  // POST /crawl/url
  if (p === "/api/crawler/crawl/url" && method === "POST") {
    const data = (await body(request)) || {};
    const target = data.url;
    if (!target) return json({ error: "url required" }, 400);
    const adapter = getAdapterForUrl(target);
    if (!adapter) return json({ error: "unsupported site" }, 400);
    const job = await listingQueue.add(JOB_CRAWL_LISTING, { site: adapter.site, url: target }, defaultJobOpts);
    return json({ jobId: job.id, site: adapter.site }, 202);
  }

  // GET /jobs
  if (p === "/api/crawler/jobs" && method === "GET") {
    let discovery, listing, discoveryFailed, listingFailed;
    try {
      [discovery, listing, discoveryFailed, listingFailed] = await Promise.all([
        withQueueTimeout(discoveryQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed"), "discovery"),
        withQueueTimeout(listingQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed"), "listing"),
        withQueueTimeout(discoveryQueue.getFailed(0, 20), "discovery"),
        withQueueTimeout(listingQueue.getFailed(0, 20), "listing"),
      ]);
    } catch (err) {
      if (err instanceof QueueTimeoutError) return json({ error: err.message, queue: err.queue }, 503);
      throw err;
    }
    const mapFailed = (jobs) => jobs.map((job) => ({ id: job.id, name: job.name, reason: job.failedReason, data: job.data }));
    return json({ discovery, listing, discovery_failed: mapFailed(discoveryFailed), listing_failed: mapFailed(listingFailed) });
  }

  // POST /jobs/:queue/:id/retry
  const retryMatch = p.match(/^\/api\/crawler\/jobs\/([^/]+)\/([^/]+)\/retry$/);
  if (retryMatch && method === "POST") {
    const queue = retryMatch[1] === "discovery" ? discoveryQueue : retryMatch[1] === "listing" ? listingQueue : null;
    if (!queue) return json({ error: "queue not found" }, 404);
    const job = await queue.getJob(retryMatch[2]);
    if (!job) return json({ error: "not found" }, 404);
    await job.retry();
    return json({ ok: true });
  }

  // GET /notifications
  if (p === "/api/crawler/notifications" && method === "GET") {
    const where = listWhere(schema.notifications, url);
    const rows = await db.select().from(schema.notifications).where(where).orderBy(desc(schema.notifications.createdAt)).limit(100);
    const listingIds = [...new Set(rows.map((r) => r.listingId).filter(Boolean))];
    const listings = listingIds.length
      ? await db.select().from(schema.listings).where(inArray(schema.listings.id, listingIds))
      : [];
    const byId = new Map(listings.map((l) => [l.id, toPlain(l)]));
    return json(rows.map((n) => ({ n: toPlain(n), listing: byId.get(n.listingId) || null })));
  }

  // POST /notifications/:id/read
  const notifMatch = p.match(/^\/api\/crawler\/notifications\/([^/]+)\/read$/);
  if (notifMatch && method === "POST") {
    const id = notifMatch[1];
    if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);
    const updated = await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, id))
      .returning({ id: schema.notifications.id });
    if (!updated.length) return json({ error: "not found" }, 404);
    return json({ ok: true });
  }

  return null;
}

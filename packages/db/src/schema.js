import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb,
  bigint, serial, varchar, primaryKey, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* =========================================================================
 * SHARED CRAWLER TABLES (identical to feruz-crawler/packages/db/src/schema.js)
 * Both apps read/write these. Keep column defs byte-compatible with feruz.
 * jdm-only additive deltas are marked with `// jdm delta`.
 * ========================================================================= */

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  sourceListingId: text("source_listing_id").notNull(),
  url: text("url").notNull(),
  slug: varchar("slug", { length: 255 }).notNull(), // jdm delta
  maker: text("maker"),
  model: text("model"),
  grade: text("grade"),
  modelYear: integer("model_year"),
  mileageKm: integer("mileage_km"),
  displacementCc: integer("displacement_cc"),
  transmission: text("transmission"),
  fuelType: text("fuel_type"),
  bodyType: text("body_type"),
  drivetrain: text("drivetrain"),
  color: text("color"),
  doors: integer("doors"),
  seats: integer("seats"),
  inspectionUntil: text("inspection_until"),
  repairHistory: boolean("repair_history"),
  totalPrice: bigint("total_price", { mode: "number" }),
  vehiclePrice: bigint("vehicle_price", { mode: "number" }),
  prefecture: text("prefecture"),
  dealerName: text("dealer_name"),
  photos: jsonb("photos").default([]),
  descriptionOriginal: text("description_original"),
  descriptionTranslated: text("description_translated"), // jdm delta
  raw: jsonb("raw"),
  status: text("status").notNull().default("active"),
  consecutiveMisses: integer("consecutive_misses").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  bySource: uniqueIndex("listings_source_id_uq").on(t.source, t.sourceListingId),
  bySlug: uniqueIndex("listings_slug_uq").on(t.slug)
}));

export const makers = pgTable("makers", {
  value: text("value").primaryKey(),
  label: text("label").notNull(),
  sites: jsonb("sites").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  price: bigint("price", { mode: "number" }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ byListing: index("price_history_listing_idx").on(t.listingId) }));

export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sites: jsonb("sites").notNull().default(["goonet", "carsensor"]),
  criteria: jsonb("criteria").notNull().default({}),
  telegramChatId: text("telegram_chat_id"),
  autoCreateVehicles: boolean("auto_create_vehicles").notNull().default(false), // jdm delta
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  site: text("site").notNull(),
  status: text("status").notNull().default("running"),
  foundCount: integer("found_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true })
}, (t) => ({
  // jdm delta: partial unique index so re-running a preset never duplicates rows.
  byListingPreset: uniqueIndex("notifications_listing_preset_uq")
    .on(t.listingId, t.presetId)
    .where(sql`preset_id is not null`)
}));

export const translationCache = pgTable("translation_cache", {
  field: text("field").notNull(),
  sourceText: text("source_text").notNull(),
  english: text("english").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ pk: primaryKey({ columns: [t.field, t.sourceText] }) }));

/* =========================================================================
 * jdm-only ENUM TYPES
 * Sequelize created these PG enum types as enum_<table>_<column>. The Drizzle
 * pgEnum name MUST match the existing PG type name, else baseline diff drifts.
 * ========================================================================= */

export const userRoleEnum = pgEnum("enum_users_role", ["client", "admin"]);
export const vehicleStatusEnum = pgEnum("enum_vehicles_status", ["available", "sold", "soon", "ask"]);
export const vehicleLocaleEnum = pgEnum("enum_vehicles_locale", ["en", "ja"]);
// NOTE: services.locale / purchasing_processes.locale are plain varchar in the
// live DB (only users.role + vehicles.status/locale became real PG enums), so
// these are modeled as varchar to match reality — not pgEnum.

/* =========================================================================
 * jdm-only TABLES (live in the SAME shared database)
 * ========================================================================= */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  salt: varchar("salt", { length: 500 }),
  hash: varchar("hash", { length: 1200 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: userRoleEnum("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date())
});

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  name: varchar("name", { length: 255 }),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date())
});

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  make: varchar("make", { length: 255 }),
  model: varchar("model", { length: 255 }),
  notes: text("notes"),
  mileage: varchar("mileage", { length: 255 }),
  color: varchar("color", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  stockNumber: integer("stock_number"),
  status: vehicleStatusEnum("status"),
  vin: varchar("vin", { length: 255 }),
  transmission: varchar("transmission", { length: 255 }),
  youtubeLink: varchar("youtube_link", { length: 255 }),
  description: text("description"),
  price: varchar("price", { length: 255 }),
  isPosted: boolean("is_posted"),
  year: integer("year"),
  locale: vehicleLocaleEnum("locale"),
  youtubeCoverId: integer("youtube_cover_id").references(() => media.id, { onDelete: "set null" }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  crawlerListingId: uuid("crawler_listing_id").references(() => listings.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true })
}, (t) => ({
  byCrawlerListing: uniqueIndex("vehicles_crawler_listing_id_uq").on(t.crawlerListingId),
  byCreatedBy: index("vehicles_created_by_id_fk").on(t.createdById),
  byUpdatedBy: index("vehicles_updated_by_id_fk").on(t.updatedById)
}));

export const vehicleMedia = pgTable("vehicle_media", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order"),
  isCover: boolean("is_cover"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date())
}, (t) => ({
  uniqVehicleMedia: uniqueIndex("vehicle_media_vehicle_id_media_id_key").on(t.vehicleId, t.mediaId)
}));

// The migration named the FK target `admin_users`, but the live DB FK actually
// references `users` (the admin_users table does not exist) — modeled to match.
export const purchasingProcesses = pgTable("purchasing_processes", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  description: jsonb("description"),
  introduction: varchar("introduction", { length: 255 }),
  locale: varchar("locale", { length: 255 }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true })
}, (t) => ({
  byCreatedBy: index("pp_created_by_id_fk").on(t.createdById),
  byUpdatedBy: index("pp_updated_by_id_fk").on(t.updatedById)
}));

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }),
  description: jsonb("description"),
  icon: varchar("icon", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  locale: varchar("locale", { length: 255 }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true })
}, (t) => ({
  byDocuments: index("services_documents_idx").on(t.locale, t.publishedAt),
  byCreatedBy: index("services_created_by_id_fk").on(t.createdById),
  byUpdatedBy: index("services_updated_by_id_fk").on(t.updatedById)
}));

export const telegramConnections = pgTable("telegram_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: text("chat_id").notNull(),
  telegramUserId: text("telegram_user_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true })
}, (t) => ({
  byChatId: uniqueIndex("telegram_connections_chat_id_uq").on(t.chatId)
}));

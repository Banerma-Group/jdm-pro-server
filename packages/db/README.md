# @jdm-pro/db

Drizzle ORM schema + migrations for jdm-pro-server. The database is **shared
with feruz-crawler**: the 7 crawler tables (`listings`, `makers`,
`price_history`, `filter_presets`, `crawl_runs`, `notifications`,
`translation_cache`) are byte-compatible with feruz's schema; the jdm-only
tables (`users`, `vehicles`, `vehicle_media`, `media`, `services`,
`purchasing_processes`, `telegram_connections`) live in the same database.

## Local dev (fresh DB)

```bash
docker compose up -d            # postgres:16 + redis:7 (from repo root)
bun run db:migrate              # applies migrations/*.sql to an empty DB
```

## Production / shared DB — DO NOT migrate; the app only consumes it

The live shared DB already has every table and is managed by other systems:
- **jdm tables** (users, vehicles, services, purchasing_processes, media,
  vehicle_media) were created by **Strapi** — they are varchar-typed (locale/
  status/role are `varchar`, not PG enums), `timestamp WITHOUT time zone` with
  **no column default**, `text` salt/hash, and carry extra Strapi columns
  (`document_id`, `source_url`) that this app simply ignores. The Sequelize
  migrations in git only ever added a few columns (crawler_listing_id,
  description_translated, auto_create_vehicles) on top.
- **crawler tables** (listings, makers, price_history, filter_presets,
  crawl_runs, notifications, translation_cache) were created by **feruz-crawler's
  drizzle** migrations (uuid/bigint/timestamptz).

`src/schema.js` is modeled to be **runtime-compatible** with that real shape
(verified by reads + writes against a full local copy): pgEnum columns read/write
fine against varchar columns, and jdm timestamps use `.$defaultFn(() => new Date())`
so values are sent client-side (the prod columns have no DB default, so
`.defaultNow()` would insert NULL and break NOT NULL columns).

**Therefore the Bun app runs NO migrations against prod** — the schema is owned
by Strapi (jdm tables) and feruz (crawler tables). `bun run db:migrate` is for
fresh **local dev** DBs only. Never run `drizzle-kit migrate`/`push` against the
shared prod DB.

## Migration ownership (shared DB)

To avoid dueling migrations, ownership is split: crawler-domain tables are
owned by feruz-crawler's migrations; jdm-domain tables (`users`, `vehicles`,
`services`, `purchasing_processes`, `media`, `vehicle_media`,
`telegram_connections`) are owned by jdm. Neither repo's migrations should drop
the other's tables.

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

## Production / shared DB (already populated) — BASELINE, do not blind-migrate

The shared Render Postgres already has every table (created originally by jdm's
Sequelize migrations + feruz's drizzle migrations). Running
`drizzle-kit migrate` blindly would try to `CREATE TABLE` objects that already
exist. Instead, **baseline** the existing migration as already-applied:

1. Confirm the authored schema matches reality:
   ```bash
   DATABASE_URL=<render-url> bun run db:introspect   # drizzle-kit pull
   ```
   Diff the introspected schema against `src/schema.js`; reconcile any drift
   (enum type names `enum_<table>_<column>`, the `purchasing_processes`
   `admin_users` FK, etc.). The introspected DB is the source of truth.
2. Seed drizzle's bookkeeping so `0000` is treated as applied **without**
   running its DDL — insert the migration hash into the `drizzle.__drizzle_migrations`
   table (created on first `migrate`). After that only *new* migrations
   (`0001+`) execute forward DDL.
3. Never use `drizzle-kit push` against the shared DB — with a partial schema it
   will try to drop the other app's tables.

## Migration ownership (shared DB)

To avoid dueling migrations, ownership is split: crawler-domain tables are
owned by feruz-crawler's migrations; jdm-domain tables (`users`, `vehicles`,
`services`, `purchasing_processes`, `media`, `vehicle_media`,
`telegram_connections`) are owned by jdm. Neither repo's migrations should drop
the other's tables.

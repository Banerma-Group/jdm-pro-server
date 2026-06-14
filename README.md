# jdm-pro-server

Bun monorepo backend for JDM Pro — a REST API plus a crawler/worker, mirroring
the architecture of `feruz-crawler`. The database is **shared with
feruz-crawler** (same crawler tables) plus jdm-only tables (users, vehicles,
services, etc.).

## Layout

```
apps/
  api/      @jdm-pro/api      Bun.serve REST API + in-process Telegram bot (port 3000)
  worker/   @jdm-pro/worker   BullMQ discovery + listing workers + scheduler
packages/
  db/       @jdm-pro/db       Drizzle schema + migrations + createDb()
  shared/   @jdm-pro/shared   redis, queue/job constants, debug, criteria schema
  lookup/   @jdm-pro/lookup   translation: dictionary -> DB cache -> OpenAI
  crawler/  @jdm-pro/crawler  carsensor/goonet adapters + CloakBrowser
```

## Local development

```bash
docker compose up -d        # postgres:16 + redis:7
cp .env.example .env        # then fill secrets
bun install
bun run db:migrate          # fresh DB only — see packages/db/README.md for the
                            # shared/populated-DB baseline procedure
bun run dev                 # API (watch)   -> http://localhost:3000
bun run dev:worker          # crawler worker (separate terminal)
bun test                    # run all package/app tests
```

## Tech

Bun · Drizzle ORM (postgres.js) · BullMQ (ioredis) · Bun.serve · Telegraf ·
CloakBrowser. ESM throughout.

## Deployment (Render, Docker)

Render has no native Bun runtime, so both services deploy via Docker (see
`render.yaml` + `Dockerfile`). One image, two Docker Commands:

| Service | Docker Command |
|---|---|
| web (`jdm-pro-server`) | `bun apps/api/src/index.js` |
| worker (`jdm-pro-worker`) | `bun apps/worker/src/index.js` |

Build for `linux/amd64` (CloakBrowser has no arm64 build). Keep the web service
at **1 instance** (the in-process Telegram bot polls getUpdates). DB migrations
on the shared/populated DB must be **baselined**, not blind-migrated — see
`packages/db/README.md`.

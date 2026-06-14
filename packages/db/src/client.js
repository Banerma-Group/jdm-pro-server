import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// Local Postgres (docker-compose) needs no SSL; managed providers (Render,
// etc.) require it. Mirror jdm's old db/config/app.js localhost detection.
function sslFor(url) {
  if (!url) return false;
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(url)) return false;
  return "require";
}

export function createDb(url = process.env.DATABASE_URL) {
  const sql = postgres(url, { max: 10, ssl: sslFor(url) });
  return { db: drizzle(sql, { schema }), sql };
}

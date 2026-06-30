import { defineConfig } from "drizzle-kit";

function isLocal(url) {
  return !url || /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
}

function dbCredentialsFor(url) {
  if (isLocal(url)) return { url };

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ssl: true,
  };
}

const databaseUrl = process.env.DATABASE_URL ?? "postgres://feruz:feruz@localhost:5432/feruz";

export default defineConfig({
  schema: "./packages/db/src/schema.js",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: dbCredentialsFor(databaseUrl)
});

import { and, eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";

// DB-backed translation cache. Takes the drizzle `db` so the same factory works
// for the API and worker (each owns its own connection).
export function createDbCache(db) {
  return {
    async get(field, sourceText) {
      const [row] = await db
        .select()
        .from(schema.translationCache)
        .where(
          and(
            eq(schema.translationCache.field, field),
            eq(schema.translationCache.sourceText, sourceText)
          )
        )
        .limit(1);
      return row?.english ?? null;
    },
    async set(field, sourceText, english) {
      await db
        .insert(schema.translationCache)
        .values({ field, sourceText, english })
        .onConflictDoNothing();
    },
  };
}

import { inArray } from "drizzle-orm";
import { schema } from "@jdm-pro/db";

// Attaches createdBy/updatedBy user objects to rows (replaces the Sequelize
// include). Strips salt/hash from the embedded users.
export async function attachAudit(db, rows) {
  const ids = [...new Set(rows.flatMap((r) => [r.createdById, r.updatedById]).filter((v) => v != null))];
  const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const byId = new Map(
    users.map((u) => {
      const { salt, hash, ...rest } = u;
      return [u.id, rest];
    })
  );
  for (const r of rows) {
    r.createdBy = r.createdById != null ? byId.get(r.createdById) ?? null : null;
    r.updatedBy = r.updatedById != null ? byId.get(r.updatedById) ?? null : null;
    // Match the old Sequelize wire shape: association FKs were snake_case.
    r.created_by_id = r.createdById ?? null;
    r.updated_by_id = r.updatedById ?? null;
    delete r.createdById;
    delete r.updatedById;
  }
  return rows;
}

export function coerceDates(obj, keys = ["publishedAt"]) {
  for (const key of keys) {
    if (typeof obj[key] === "string" && obj[key]) obj[key] = new Date(obj[key]);
  }
  return obj;
}

export function pick(obj, allowed) {
  const out = {};
  for (const key of allowed) {
    if (key in obj && obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

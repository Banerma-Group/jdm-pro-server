import { asc, desc } from "drizzle-orm";

function camel(value) {
  return String(value).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Mirrors the old qps() defaults: limit=10, page=0 (offset=page*limit),
// sort='created_at', order DESC. search is handled per-route.
export function parseListQuery(url) {
  const sp = url.searchParams;
  const limit = Math.max(1, Number(sp.get("limit")) || 10);
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const offset = page * limit;
  const sort = sp.get("sort") || "created_at";
  const order = (sp.get("order") || "DESC").toUpperCase() === "ASC" ? "asc" : "desc";
  const search = (sp.get("search") || "").trim();
  return { limit, page, offset, sort, order, search };
}

export function orderColumn(table, sort, order) {
  const col = table[camel(sort)] || table.createdAt;
  return order === "asc" ? asc(col) : desc(col);
}

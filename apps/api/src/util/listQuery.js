import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";

const CONTROL_PARAMS = new Set(["limit", "page", "sort", "order", "search"]);

export function camel(value) {
  return String(value).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function snake(value) {
  return String(value).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
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

function valuesFor(sp, param) {
  const aliases = [...new Set([param, snake(param), `${param}[]`, `${snake(param)}[]`])];
  return aliases.flatMap((key) => sp.getAll(key)).map((value) => String(value).trim()).filter(Boolean);
}

function parseValue(raw, type) {
  if (raw === "null") return null;
  if (raw === "not-null") return Symbol.for("not-null");
  if (type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  if (type === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return undefined;
  }
  if (type === "date") {
    const value = new Date(raw);
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  return raw;
}

export function filterConditions(table, url, fields = []) {
  const sp = url.searchParams;
  const conditions = [];
  for (const field of fields) {
    const spec = typeof field === "string" ? { param: field } : field;
    const param = spec.param;
    if (!param || CONTROL_PARAMS.has(param)) continue;
    const column = spec.column || table[spec.field || camel(param)];
    if (!column) continue;

    const rawValues = valuesFor(sp, param);
    if (!rawValues.length) continue;
    const values = rawValues.map((value) => parseValue(value, spec.type)).filter((value) => value !== undefined);
    if (!values.length) continue;

    if (values.length === 1) {
      if (values[0] === null) conditions.push(isNull(column));
      else if (values[0] === Symbol.for("not-null")) conditions.push(isNotNull(column));
      else conditions.push(eq(column, values[0]));
    } else if (spec.type === "number" || spec.type === "date") {
      conditions.push(gte(column, values[0]));
      conditions.push(lte(column, values[1]));
    } else {
      conditions.push(inArray(column, values));
    }
  }
  return conditions;
}

export function listWhere(table, url, fields = [], extra = []) {
  const conditions = [...filterConditions(table, url, fields), ...extra].filter(Boolean);
  return conditions.length ? and(...conditions) : undefined;
}

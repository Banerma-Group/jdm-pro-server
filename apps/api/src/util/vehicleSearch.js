import { and, eq, or, ilike, sql } from "drizzle-orm";
import { schema } from "@jdm-pro/db";

const VEHICLE_TEXT_COLUMNS = [
  schema.vehicles.make,
  schema.vehicles.model,
  schema.vehicles.description,
  schema.vehicles.color,
  schema.vehicles.vin,
  schema.vehicles.slug,
];

const VEHICLE_NAME_COLUMNS = [schema.vehicles.make, schema.vehicles.model, schema.vehicles.slug];

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function normalizeVehicleSearchTerm(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractVehicleStockSearch(term) {
  const normalized = normalizeVehicleSearchTerm(term);
  if (/^\d+$/.test(normalized)) return normalized;

  const explicitStock = normalized.match(/^(?:stock(?:\s*(?:number|no\.?|#))?|#)\s*(\d+)$/i);
  return explicitStock?.[1] ?? "";
}

export function tokenizeVehicleNameSearch(term) {
  return normalizeVehicleSearchTerm(term)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function stockNumberPredicate(term) {
  const digits = extractVehicleStockSearch(term);
  if (!digits) return null;
  const stockNumber = Number(digits);
  const predicates = [
    Number.isSafeInteger(stockNumber) ? eq(schema.vehicles.stockNumber, stockNumber) : null,
    sql`CAST(${schema.vehicles.stockNumber} AS text) LIKE ${`${escapeLike(digits)}%`} ESCAPE '\\'`,
  ].filter(Boolean);

  return or(...predicates);
}

function textContainsPredicate(term) {
  const pattern = `%${escapeLike(term)}%`;
  return or(...VEHICLE_TEXT_COLUMNS.map((column) => ilike(column, pattern)));
}

function nameTokenPredicate(term) {
  const tokens = tokenizeVehicleNameSearch(term);
  if (tokens.length < 2) return null;

  return and(
    ...tokens.map((token) => {
      const pattern = `%${escapeLike(token)}%`;
      return or(...VEHICLE_NAME_COLUMNS.map((column) => ilike(column, pattern)));
    })
  );
}

export function buildVehicleSearchWhere(rawTerm) {
  const term = normalizeVehicleSearchTerm(rawTerm);
  if (!term) return undefined;

  const predicates = [
    textContainsPredicate(term),
    nameTokenPredicate(term),
    stockNumberPredicate(term),
  ].filter(Boolean);

  return or(...predicates);
}

export function vehicleSearchRank(rawTerm) {
  const term = normalizeVehicleSearchTerm(rawTerm);
  const digits = extractVehicleStockSearch(term);
  const exactPattern = escapeLike(term);
  const prefixPattern = `${escapeLike(term)}%`;
  const containsPattern = `%${escapeLike(term)}%`;
  const stockPrefixPattern = `${escapeLike(digits)}%`;
  const stockNumber = Number(digits);
  const exactStockRank = digits && Number.isSafeInteger(stockNumber)
    ? sql`${schema.vehicles.stockNumber} = ${stockNumber}`
    : sql`false`;
  const prefixStockRank = digits
    ? sql`CAST(${schema.vehicles.stockNumber} AS text) LIKE ${stockPrefixPattern} ESCAPE '\\'`
    : sql`false`;

  return sql`
    CASE
      WHEN ${exactStockRank} THEN 0
      WHEN ${prefixStockRank} THEN 1
      WHEN lower(${schema.vehicles.make}) = lower(${exactPattern})
        OR lower(${schema.vehicles.model}) = lower(${exactPattern})
        OR lower(concat_ws(' ', ${schema.vehicles.make}, ${schema.vehicles.model})) = lower(${exactPattern})
      THEN 2
      WHEN ${schema.vehicles.make} ILIKE ${prefixPattern} ESCAPE '\\'
        OR ${schema.vehicles.model} ILIKE ${prefixPattern} ESCAPE '\\'
        OR concat_ws(' ', ${schema.vehicles.make}, ${schema.vehicles.model}) ILIKE ${prefixPattern} ESCAPE '\\'
      THEN 3
      WHEN ${schema.vehicles.make} ILIKE ${containsPattern} ESCAPE '\\'
        OR ${schema.vehicles.model} ILIKE ${containsPattern} ESCAPE '\\'
        OR concat_ws(' ', ${schema.vehicles.make}, ${schema.vehicles.model}) ILIKE ${containsPattern} ESCAPE '\\'
      THEN 4
      ELSE 5
    END
  `;
}

export function vehicleStatusRank() {
  return sql`
    CASE
      WHEN ${schema.vehicles.status} = 'available' THEN 0
      WHEN ${schema.vehicles.status} = 'soon' THEN 1
      WHEN ${schema.vehicles.status} = 'ask' THEN 2
      WHEN ${schema.vehicles.status} IS NULL THEN 3
      WHEN ${schema.vehicles.status} = 'sold' THEN 4
      ELSE 3
    END
  `;
}

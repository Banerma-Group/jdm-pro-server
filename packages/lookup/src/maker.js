import { maker as makerDict } from "./dictionaries.js";

// Single source of truth for the canonical maker key. Used at every edge that
// produces or compares a maker: listing ingest (upsert), preset criteria, and
// the /makers dropdown options. The dictionary maps JP names / aliases
// (e.g. "トヨタ" -> "toyota"); anything unknown falls back to NFKC + lowercase.
// Keeping ingest and criteria on the SAME function is what lets matchesCriteria
// compare them with plain equality.
export function canonicalMaker(value) {
  if (value == null) return value;
  const normalized = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  return makerDict[value] || makerDict[normalized] || normalized.toLowerCase();
}

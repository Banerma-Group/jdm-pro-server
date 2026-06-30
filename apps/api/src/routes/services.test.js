import { describe, expect, test } from "bun:test";
import { serviceLookupWhere } from "./services.js";

function collectSqlParts(value, parts = { columns: [], params: [] }, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return parts;
  seen.add(value);

  if (typeof value.name === "string" && typeof value.dataType === "string") {
    parts.columns.push(value.name);
  }
  if ("value" in value && value.constructor?.name === "Param") {
    parts.params.push(value.value);
  }

  for (const child of value.queryChunks || []) {
    collectSqlParts(child, parts, seen);
  }

  return parts;
}

describe("service route lookup", () => {
  test("uses id lookup for numeric route identifiers", () => {
    const parts = collectSqlParts(serviceLookupWhere("13"));

    expect(parts.columns).toContain("id");
    expect(parts.columns).not.toContain("slug");
    expect(parts.params).toContain(13);
  });

  test("uses slug and optional locale lookup for non-numeric route identifiers", () => {
    const parts = collectSqlParts(serviceLookupWhere("storage-shipment-and-import", "en"));

    expect(parts.columns).toContain("slug");
    expect(parts.columns).toContain("locale");
    expect(parts.columns).not.toContain("id");
    expect(parts.params).toContain("storage-shipment-and-import");
    expect(parts.params).toContain("en");
  });
});

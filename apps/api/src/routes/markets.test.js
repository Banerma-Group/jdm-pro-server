import { describe, expect, test } from "bun:test";
import { marketLookupWhere } from "./markets.js";

function conditionText(condition) {
  return condition.queryChunks
    .map((chunk) => {
      if (chunk?.value) return Array.isArray(chunk.value) ? chunk.value.join("") : "";
      if (chunk?.name) return chunk.name;
      return "";
    })
    .join("");
}

describe("market route lookup", () => {
  test("uses id lookup for numeric route identifiers", () => {
    expect(conditionText(marketLookupWhere("7"))).toBe("id = ");
  });

  test("uses slug lookup for non-numeric route identifiers", () => {
    expect(conditionText(marketLookupWhere("jdm"))).toBe("slug = ");
  });
});

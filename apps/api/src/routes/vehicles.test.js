import { describe, expect, test } from "bun:test";
import { vehicleListOrderBy, vehicleMarketWhere } from "./vehicles.js";

function orderText(order) {
  return order.queryChunks
    .map((chunk) => {
      if (chunk?.value) return chunk.value.join("");
      if (chunk?.name) return chunk.name;
      return "";
    })
    .join("");
}

describe("vehicle list ordering", () => {
  test("defaults to lowest stock number first", () => {
    const orderBy = vehicleListOrderBy();

    expect(orderBy).toHaveLength(2);
    expect(orderText(orderBy[0])).toBe("stock_number ASC NULLS LAST");
    expect(orderText(orderBy[1])).toBe("created_at desc");
  });

  test("keeps search relevance before stock number ordering", () => {
    const orderBy = vehicleListOrderBy({ search: "skyline" });

    expect(orderBy).toHaveLength(3);
    expect(orderText(orderBy[1])).toBe("stock_number ASC NULLS LAST");
    expect(orderText(orderBy[2])).toBe("created_at desc");
  });

  test("prioritizes main vehicles before stock number fallback", () => {
    const orderBy = vehicleListOrderBy({ preferMain: true });

    expect(orderBy).toHaveLength(3);
    expect(orderText(orderBy[0])).toBe("CASE WHEN is_main THEN 0 ELSE 1 END");
    expect(orderText(orderBy[1])).toBe("stock_number ASC NULLS LAST");
    expect(orderText(orderBy[2])).toBe("created_at desc");
  });
});

describe("vehicle market filtering", () => {
  test("builds a slug filter for market query params", () => {
    const where = vehicleMarketWhere(new URL("http://localhost/api/vehicles?market=jdm"));

    expect(orderText(where)).toContain('market_id IN (SELECT id FROM "markets" WHERE "slug" = ');
  });

  test("ignores missing and all market params", () => {
    expect(vehicleMarketWhere(new URL("http://localhost/api/vehicles"))).toBeUndefined();
    expect(vehicleMarketWhere(new URL("http://localhost/api/vehicles?market=all"))).toBeUndefined();
  });
});

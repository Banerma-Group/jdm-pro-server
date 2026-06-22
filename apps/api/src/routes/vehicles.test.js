import { describe, expect, test } from "bun:test";
import { vehicleListOrderBy } from "./vehicles.js";

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
});

import { describe, expect, test } from "bun:test";
import { schema } from "@jdm-pro/db";
import { filterConditions, listWhere, parseListQuery } from "./listQuery.js";

function url(path) {
  return new URL(path, "http://localhost");
}

describe("list query helpers", () => {
  test("parseListQuery treats page=1 as the first page", () => {
    expect(parseListQuery(url("/api/vehicles"))).toMatchObject({
      limit: 10,
      page: 1,
      offset: 0,
      sort: "created_at",
      order: "desc",
      search: "",
    });
    expect(parseListQuery(url("/api/vehicles?limit=20&page=2&order=ASC&search=rx"))).toMatchObject({
      limit: 20,
      page: 2,
      offset: 20,
      order: "asc",
      search: "rx",
    });
    expect(parseListQuery(url("/api/vehicles?limit=12&page=1&status=ask"))).toMatchObject({
      limit: 12,
      page: 1,
      offset: 0,
    });
    expect(parseListQuery(url("/api/vehicles?limit=12&page=0&status=ask"))).toMatchObject({
      limit: 12,
      page: 1,
      offset: 0,
    });
  });

  test("filterConditions ignores control params and accepts snake/camel aliases", () => {
    const conditions = filterConditions(schema.vehicles, url("/api/vehicles?limit=5&stock_number=7&isPosted=true&locale=ja"), [
      { param: "stockNumber", type: "number" },
      { param: "isPosted", type: "boolean" },
      "locale",
    ]);
    expect(conditions).toHaveLength(3);
  });

  test("filterConditions infers filterable columns from the Drizzle table", () => {
    const conditions = filterConditions(schema.vehicles, url("/api/vehicles?page=1&status=ask&limit=12&stock_number=7&isPosted=false"));
    expect(conditions).toHaveLength(3);
  });

  test("filterConditions supports repeated values and numeric ranges", () => {
    const conditions = filterConditions(schema.vehicles, url("/api/vehicles?status=available&status=sold&year=2018&year=2022"), [
      "status",
      { param: "year", type: "number" },
    ]);
    expect(conditions).toHaveLength(3);
  });

  test("listWhere returns undefined when no filters are present", () => {
    expect(listWhere(schema.media, url("/api/media?limit=10"))).toBeUndefined();
  });
});

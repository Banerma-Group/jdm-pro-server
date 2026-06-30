import { describe, expect, test } from "bun:test";
import { schema } from "@jdm-pro/db";
import { filterConditions, listWhere, orderColumn, parseListQuery } from "./listQuery.js";

function url(path) {
  return new URL(path, "http://localhost");
}

function orderText(order) {
  return order.queryChunks
    .map((chunk) => {
      if (chunk?.value) return chunk.value.join("");
      if (chunk?.name) return chunk.name;
      return "";
    })
    .join("");
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
    const conditions = filterConditions(schema.vehicles, url("/api/vehicles?page=1&status=ask&limit=12&stock_number=7&isPosted=false&market=JDM"));
    expect(conditions).toHaveLength(4);
  });

  test("filterConditions works across model-backed API tables", () => {
    expect(filterConditions(schema.services, url("/api/services?locale=ja&slug=shipping"))).toHaveLength(2);
    expect(filterConditions(schema.purchasingProcesses, url("/api/purchasing-processes?published_at=not-null&created_by_id=5"))).toHaveLength(2);
    expect(filterConditions(schema.media, url("/api/media?user_id=3&name=cover"))).toHaveLength(2);
    expect(filterConditions(schema.listings, url("/api/crawler/listings?source=goonet&total_price=100&total_price=200"))).toHaveLength(3);
    expect(filterConditions(schema.filterPresets, url("/api/crawler/presets?enabled=true&telegram_chat_id=null"))).toHaveLength(2);
    expect(filterConditions(schema.makers, url("/api/crawler/makers?value=toyota"))).toHaveLength(1);
    expect(filterConditions(schema.notifications, url("/api/crawler/notifications?read_at=null&preset_id=abc"))).toHaveLength(2);
    expect(filterConditions(schema.telegramConnections, url("/api/crawler/telegram/connections?chat_id=123"))).toHaveLength(1);
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

  test("orderColumn accepts dashboard camelCase sort fields", () => {
    expect(orderText(orderColumn(schema.listings, "modelYear", "asc"))).toBe("model_year asc");
    expect(orderText(orderColumn(schema.listings, "totalPrice", "desc"))).toBe("total_price desc");
    expect(orderText(orderColumn(schema.filterPresets, "autoCreateVehicles", "asc"))).toBe("auto_create_vehicles asc");
  });

  test("orderColumn accepts snake_case aliases and falls back safely", () => {
    expect(orderText(orderColumn(schema.filterPresets, "last_run_at", "desc"))).toBe("last_run_at desc");
    expect(orderText(orderColumn(schema.filterPresets, "missing", "asc"))).toBe("created_at asc");
    expect(orderText(orderColumn(schema.listings, "missing", "desc", schema.listings.lastSeenAt))).toBe("last_seen_at desc");
  });
});

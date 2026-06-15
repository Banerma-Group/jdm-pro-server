import { expect, test } from "bun:test";
import {
  extractVehicleStockSearch,
  normalizeVehicleSearchTerm,
  tokenizeVehicleNameSearch,
  vehicleStatusRank,
} from "./vehicleSearch.js";

test("normalizeVehicleSearchTerm trims unicode input and collapses whitespace", () => {
  expect(normalizeVehicleSearchTerm("  Toyota   Land\u3000Cruiser  ")).toBe("Toyota Land Cruiser");
});

test("tokenizeVehicleNameSearch keeps bounded make/model style tokens", () => {
  expect(tokenizeVehicleNameSearch("toyota land cruiser prado tx package extra terms")).toEqual([
    "toyota",
    "land",
    "cruiser",
    "prado",
    "tx",
    "package",
  ]);
});

test("extractVehicleStockSearch supports numeric stock searches embedded in labels", () => {
  expect(extractVehicleStockSearch("stock #00123")).toBe("00123");
  expect(extractVehicleStockSearch("#123")).toBe("123");
  expect(extractVehicleStockSearch("123")).toBe("123");
  expect(extractVehicleStockSearch("Toyota Prado")).toBe("");
  expect(extractVehicleStockSearch("R35")).toBe("");
});

test("vehicleStatusRank returns a sql ranking expression", () => {
  expect(vehicleStatusRank()).toBeTruthy();
});

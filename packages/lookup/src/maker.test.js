import { test, expect } from "bun:test";
import { canonicalMaker } from "./maker.js";

test("maps Japanese maker names to the canonical key via the dictionary", () => {
  expect(canonicalMaker("トヨタ")).toBe("toyota");
  expect(canonicalMaker("日産")).toBe("nissan");
});

test("lowercases unknown / latin makers", () => {
  expect(canonicalMaker("Toyota")).toBe("toyota");
  expect(canonicalMaker("  BMW ")).toBe("bmw");
});

test("is idempotent on an already-canonical value", () => {
  expect(canonicalMaker("toyota")).toBe("toyota");
  expect(canonicalMaker("mercedes-benz")).toBe("mercedes-benz");
});

test("passes through null/empty unchanged", () => {
  expect(canonicalMaker(null)).toBe(null);
  expect(canonicalMaker("")).toBe("");
});

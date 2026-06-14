import { test, expect } from "bun:test";
import { listingSlug, normalizeListing } from "./upsert.js";

test("listingSlug mirrors vehicle slug format with a unique hex suffix", () => {
  const slug = listingSlug("BMW", "3 Series");

  expect(slug).toMatch(/^bmw-3-series-[0-9a-f]{8}$/);
});

test("listingSlug falls back to the suffix when maker and model are missing", () => {
  const slug = listingSlug(null, null);

  expect(slug).toMatch(/^[0-9a-f]{8}$/);
});

test("normalizeListing does not accept caller-provided slugs", () => {
  const listing = normalizeListing({
    source: "goonet",
    sourceListingId: "123",
    url: "https://example.com/listing",
    maker: "Toyota",
    model: "Prius",
    slug: "custom-slug",
  });

  expect(listing.slug).toBeUndefined();
});

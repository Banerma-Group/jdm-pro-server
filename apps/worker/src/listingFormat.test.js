import { test, expect } from "bun:test";
import { buildCaption, buildKeyboard, coverPhoto } from "./listingFormat.js";

const listing = {
  id: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
  maker: "toyota",
  model: "land-cruiser",
  modelYear: 2019,
  totalPrice: 5400000,
  mileageKm: 42000,
  prefecture: "tokyo",
  descriptionTranslated: "Clean one-owner example.",
  url: "https://example.com/listing/1",
  photos: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
};

test("coverPhoto returns the first photo, null when none", () => {
  expect(coverPhoto(listing)).toBe("https://cdn.example/a.jpg");
  expect(coverPhoto({ ...listing, photos: [] })).toBe(null);
  expect(coverPhoto({ ...listing, photos: null })).toBe(null);
});

test("buildCaption escapes html and includes the source link in html mode", () => {
  const caption = buildCaption({ ...listing, model: "a<b>c" }, { html: true });
  expect(caption).toMatch(/&lt;b&gt;/);
  expect(caption).toMatch(/<a href="https:\/\/example\.com\/listing\/1">/);
});

test("buildCaption adds hashtags only when requested (instagram mode)", () => {
  expect(buildCaption(listing, { html: true })).not.toMatch(/#/);
  expect(buildCaption(listing, { hashtags: true })).toMatch(/#toyota/);
});

test("buildKeyboard: off -> callback button, on -> url button; callback_data stays <= 64 bytes", () => {
  const off = buildKeyboard({ listingId: listing.id, autoCreateVehicles: false });
  expect(off[0][0].callback_data).toBe(`pv:${listing.id}`);
  expect(Buffer.byteLength(off[0][0].callback_data)).toBeLessThanOrEqual(64);
  expect(off[1][0].callback_data).toBe(`ig:${listing.id}`);

  const on = buildKeyboard({
    listingId: listing.id,
    autoCreateVehicles: true,
    vehicleUrl: "https://dash/vehicles/9",
  });
  expect(on[0][0].url).toBe("https://dash/vehicles/9");
  expect(on[0][0].callback_data).toBeUndefined();
});

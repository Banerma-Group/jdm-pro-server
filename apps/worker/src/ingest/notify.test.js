import { test, expect } from "bun:test";
import { notifyMatches } from "./notify.js";

function makeListing(overrides = {}) {
  return {
    id: "listing-1",
    source: "goonet",
    maker: "bmw",
    model: "3 series",
    totalPrice: 2304000,
    modelYear: 2019,
    mileageKm: 59000,
    url: "https://www.goo-net.com/usedcar/spread/goo/1/123.html",
    ...overrides,
  };
}

// Replaces the drizzle-backed loadPresets/recordNotification with an in-memory
// store so the notify logic can be tested without a database.
function makeFakeStore(presets) {
  const store = [];
  return {
    store,
    loadPresets: async () => presets,
    recordNotification: async (listingId, presetId) => {
      const existing = store.find((n) => n.listingId === listingId && n.presetId === presetId);
      if (existing) return false;
      store.push({ id: `notif-${store.length + 1}`, listingId, presetId });
      return true;
    },
  };
}

const bmwPreset = {
  id: "preset-bmw",
  name: "BMW under 3M",
  enabled: true,
  sites: ["goonet", "carsensor"],
  criteria: { maker: "bmw", priceMax: 3000000 },
  telegramChatId: "12345",
};

test("creates a notification for a matching listing even when it already existed (not new)", async () => {
  const fake = makeFakeStore([bmwPreset]);
  const sent = [];
  const telegram = { send: async (chatId, text) => sent.push({ chatId, text }) };

  const count = await notifyMatches(makeListing(), { telegram, ...fake });

  expect(count).toBe(1);
  expect(fake.store.length).toBe(1);
  expect(sent.length).toBe(1);
});

test("does not create a duplicate notification or re-send telegram on a repeat crawl", async () => {
  const fake = makeFakeStore([bmwPreset]);
  const sent = [];
  const telegram = { send: async (chatId, text) => sent.push({ chatId, text }) };

  await notifyMatches(makeListing(), { telegram, ...fake });
  const secondCount = await notifyMatches(makeListing(), { telegram, ...fake });

  expect(secondCount).toBe(0);
  expect(fake.store.length).toBe(1);
  expect(sent.length).toBe(1);
});

test("does not notify when the listing fails the preset criteria", async () => {
  const fake = makeFakeStore([bmwPreset]);
  const telegram = { send: async () => {} };

  const count = await notifyMatches(makeListing({ totalPrice: 7070000 }), { telegram, ...fake });

  expect(count).toBe(0);
  expect(fake.store.length).toBe(0);
});

test('matches when criteria.maker is stored non-canonically (e.g. "Toyota" vs listing "toyota")', async () => {
  const preset = {
    id: "preset-toyota",
    name: "Toyota",
    enabled: true,
    sites: ["goonet"],
    criteria: { maker: "Toyota" },
    telegramChatId: null,
  };
  const fake = makeFakeStore([preset]);

  const count = await notifyMatches(makeListing({ maker: "toyota", model: "prius" }), { ...fake });

  expect(count).toBe(1);
  expect(fake.store.length).toBe(1);
});

test('sends a photo post with a "Post to vehicles" callback button when autoCreateVehicles is off', async () => {
  const fake = makeFakeStore([bmwPreset]);
  const photos = [];
  const telegram = {
    send: async () => {
      throw new Error("should not fall back to text when a photo exists");
    },
    sendPhoto: async (chatId, photoUrl, caption, keyboard) => photos.push({ chatId, photoUrl, caption, keyboard }),
  };

  await notifyMatches(makeListing({ photos: ["https://cdn.example/cover.jpg"] }), { telegram, ...fake });

  expect(photos.length).toBe(1);
  const [post] = photos;
  expect(post.chatId).toBe("12345");
  expect(post.photoUrl).toBe("https://cdn.example/cover.jpg");
  expect(post.keyboard[0][0].callback_data).toBe("pv:listing-1");
  expect(post.keyboard[1][0].callback_data).toBe("ig:listing-1");
});

test('uses a "View vehicle" url button (front website inventory by slug) when autoCreateVehicles is on', async () => {
  const prev = process.env.FRONT_HOST_NAME;
  process.env.FRONT_HOST_NAME = "https://jdm.example";
  try {
    const preset = { ...bmwPreset, autoCreateVehicles: true };
    const fake = makeFakeStore([preset]);
    const imported = [];
    const createVehicle = async (id) => {
      imported.push(id);
      return { vehicle: { id: "veh-9", slug: "bmw-3-series-abc123" }, created: true };
    };
    const photos = [];
    const telegram = {
      send: async () => {},
      sendPhoto: async (chatId, photoUrl, caption, keyboard) => photos.push({ keyboard }),
    };

    await notifyMatches(makeListing({ photos: ["https://cdn.example/cover.jpg"] }), {
      telegram,
      createVehicle,
      ...fake,
    });

    expect(imported).toEqual(["listing-1"]);
    const button = photos[0].keyboard[0][0];
    expect(button.url).toBe("https://jdm.example/en/inventory/bmw-3-series-abc123");
    expect(button.callback_data).toBeUndefined();
  } finally {
    process.env.FRONT_HOST_NAME = prev;
  }
});

test("falls back to a plain text message when the listing has no photo", async () => {
  const fake = makeFakeStore([bmwPreset]);
  const sent = [];
  let photoCalled = false;
  const telegram = {
    send: async (chatId, text) => sent.push({ chatId, text }),
    sendPhoto: async () => {
      photoCalled = true;
    },
  };

  await notifyMatches(makeListing(), { telegram, ...fake });

  expect(photoCalled).toBe(false);
  expect(sent.length).toBe(1);
});

test("matches when criteria.maker is provided in Japanese against the canonical listing maker", async () => {
  const preset = {
    id: "preset-jp",
    name: "Toyota JP",
    enabled: true,
    sites: ["goonet"],
    criteria: { maker: "トヨタ" },
    telegramChatId: null,
  };
  const fake = makeFakeStore([preset]);

  const count = await notifyMatches(makeListing({ maker: "toyota" }), { ...fake });

  expect(count).toBe(1);
});

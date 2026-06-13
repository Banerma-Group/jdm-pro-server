const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyMatches } = require('./notify');

function makeListing(overrides = {}) {
  return {
    id: 'listing-1',
    source: 'goonet',
    maker: 'bmw',
    model: '3 series',
    totalPrice: 2304000,
    modelYear: 2019,
    mileageKm: 59000,
    url: 'https://www.goo-net.com/usedcar/spread/goo/1/123.html',
    ...overrides,
  };
}

function makeFakeModels(presets) {
  const store = [];
  return {
    store,
    FilterPreset: {
      findAll: async () => presets,
    },
    Notification: {
      findOrCreate: async ({ where }) => {
        const existing = store.find(
          n => n.listingId === where.listingId && n.presetId === where.presetId
        );
        if (existing) return [existing, false];
        const created = { id: `notif-${store.length + 1}`, ...where };
        store.push(created);
        return [created, true];
      },
    },
  };
}

const bmwPreset = {
  id: 'preset-bmw',
  name: 'BMW under 3M',
  enabled: true,
  sites: ['goonet', 'carsensor'],
  criteria: { maker: 'bmw', priceMax: 3000000 },
  telegramChatId: '12345',
};

test('creates a notification for a matching listing even when it already existed (not new)', async () => {
  const models = makeFakeModels([bmwPreset]);
  const sent = [];
  const telegram = { send: async (chatId, text) => sent.push({ chatId, text }) };

  const count = await notifyMatches(makeListing(), { telegram, models });

  assert.equal(count, 1, 'should record one new match');
  assert.equal(models.store.length, 1, 'should create exactly one notification row');
  assert.equal(sent.length, 1, 'should send one telegram message');
});

test('does not create a duplicate notification or re-send telegram on a repeat crawl', async () => {
  const models = makeFakeModels([bmwPreset]);
  const sent = [];
  const telegram = { send: async (chatId, text) => sent.push({ chatId, text }) };

  await notifyMatches(makeListing(), { telegram, models });
  const secondCount = await notifyMatches(makeListing(), { telegram, models });

  assert.equal(secondCount, 0, 'second pass yields no new matches');
  assert.equal(models.store.length, 1, 'must not duplicate the notification');
  assert.equal(sent.length, 1, 'must not re-send telegram for an existing match');
});

test('does not notify when the listing fails the preset criteria', async () => {
  const models = makeFakeModels([bmwPreset]);
  const telegram = { send: async () => {} };

  const count = await notifyMatches(makeListing({ totalPrice: 7070000 }), { telegram, models });

  assert.equal(count, 0);
  assert.equal(models.store.length, 0);
});

test('matches when criteria.maker is stored non-canonically (e.g. "Toyota" vs listing "toyota")', async () => {
  const preset = {
    id: 'preset-toyota',
    name: 'Toyota',
    enabled: true,
    sites: ['goonet'],
    criteria: { maker: 'Toyota' },
    telegramChatId: null,
  };
  const models = makeFakeModels([preset]);

  const count = await notifyMatches(makeListing({ maker: 'toyota', model: 'prius' }), { models });

  assert.equal(count, 1, 'criteria maker "Toyota" must match canonical listing maker "toyota"');
  assert.equal(models.store.length, 1);
});

test('sends a photo post with a "Post to vehicles" callback button when autoCreateVehicles is off', async () => {
  const models = makeFakeModels([bmwPreset]);
  const photos = [];
  const telegram = {
    send: async () => {
      throw new Error('should not fall back to text when a photo exists');
    },
    sendPhoto: async (chatId, photoUrl, caption, keyboard) =>
      photos.push({ chatId, photoUrl, caption, keyboard }),
  };

  await notifyMatches(makeListing({ photos: ['https://cdn.example/cover.jpg'] }), {
    telegram,
    models,
  });

  assert.equal(photos.length, 1, 'should send exactly one photo post');
  const [post] = photos;
  assert.equal(post.chatId, '12345');
  assert.equal(post.photoUrl, 'https://cdn.example/cover.jpg');
  assert.equal(post.keyboard[0][0].callback_data, 'pv:listing-1', 'row 1 = post to vehicles');
  assert.equal(post.keyboard[1][0].callback_data, 'ig:listing-1', 'row 2 = instagram');
});

test('uses a "View vehicle" url button (front website inventory by slug) when autoCreateVehicles is on', async () => {
  const prev = process.env.FRONT_HOST_NAME;
  process.env.FRONT_HOST_NAME = 'https://jdm.example';
  try {
    const preset = { ...bmwPreset, autoCreateVehicles: true };
    const models = makeFakeModels([preset]);
    const imported = [];
    const createVehicle = async id => {
      imported.push(id);
      return { vehicle: { id: 'veh-9', slug: 'bmw-3-series-abc123' }, created: true };
    };
    const photos = [];
    const telegram = {
      send: async () => {},
      sendPhoto: async (chatId, photoUrl, caption, keyboard) => photos.push({ keyboard }),
    };

    await notifyMatches(makeListing({ photos: ['https://cdn.example/cover.jpg'] }), {
      telegram,
      models,
      createVehicle,
    });

    assert.deepEqual(imported, ['listing-1'], 'should ensure the vehicle exists');
    const button = photos[0].keyboard[0][0];
    assert.equal(button.url, 'https://jdm.example/en/inventory/bmw-3-series-abc123');
    assert.equal(button.callback_data, undefined, 'view button is a url, not a callback');
  } finally {
    process.env.FRONT_HOST_NAME = prev;
  }
});

test('falls back to a plain text message when the listing has no photo', async () => {
  const models = makeFakeModels([bmwPreset]);
  const sent = [];
  let photoCalled = false;
  const telegram = {
    send: async (chatId, text) => sent.push({ chatId, text }),
    sendPhoto: async () => {
      photoCalled = true;
    },
  };

  await notifyMatches(makeListing(), { telegram, models });

  assert.equal(photoCalled, false, 'must not call sendPhoto without a photo');
  assert.equal(sent.length, 1, 'should send one text message as fallback');
});

test('matches when criteria.maker is provided in Japanese against the canonical listing maker', async () => {
  const preset = {
    id: 'preset-jp',
    name: 'Toyota JP',
    enabled: true,
    sites: ['goonet'],
    criteria: { maker: 'トヨタ' },
    telegramChatId: null,
  };
  const models = makeFakeModels([preset]);

  const count = await notifyMatches(makeListing({ maker: 'toyota' }), { models });

  assert.equal(count, 1, 'criteria maker "トヨタ" must match canonical listing maker "toyota"');
});

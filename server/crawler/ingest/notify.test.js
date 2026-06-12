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

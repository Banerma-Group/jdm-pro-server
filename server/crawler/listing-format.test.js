const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCaption, buildKeyboard, coverPhoto } = require('./listing-format');

const listing = {
  id: '0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9',
  maker: 'toyota',
  model: 'land-cruiser',
  modelYear: 2019,
  totalPrice: 5400000,
  mileageKm: 42000,
  prefecture: 'tokyo',
  descriptionTranslated: 'Clean one-owner example.',
  url: 'https://example.com/listing/1',
  photos: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
};

test('coverPhoto returns the first photo, null when none', () => {
  assert.equal(coverPhoto(listing), 'https://cdn.example/a.jpg');
  assert.equal(coverPhoto({ ...listing, photos: [] }), null);
  assert.equal(coverPhoto({ ...listing, photos: null }), null);
});

test('buildCaption escapes html and includes the source link in html mode', () => {
  const caption = buildCaption({ ...listing, model: 'a<b>c' }, { html: true });
  assert.match(caption, /&lt;b&gt;/, 'angle brackets are escaped');
  assert.match(caption, /<a href="https:\/\/example\.com\/listing\/1">/, 'source link rendered');
});

test('buildCaption adds hashtags only when requested (instagram mode)', () => {
  assert.doesNotMatch(buildCaption(listing, { html: true }), /#/);
  assert.match(buildCaption(listing, { hashtags: true }), /#toyota/);
});

test('buildKeyboard: off -> callback button, on -> url button; callback_data stays <= 64 bytes', () => {
  const off = buildKeyboard({ listingId: listing.id, autoCreateVehicles: false });
  assert.equal(off[0][0].callback_data, `pv:${listing.id}`);
  assert.ok(
    Buffer.byteLength(off[0][0].callback_data) <= 64,
    'callback_data within Telegram limit'
  );
  assert.equal(off[1][0].callback_data, `ig:${listing.id}`);

  const on = buildKeyboard({
    listingId: listing.id,
    autoCreateVehicles: true,
    vehicleUrl: 'https://dash/vehicles/9',
  });
  assert.equal(on[0][0].url, 'https://dash/vehicles/9');
  assert.equal(on[0][0].callback_data, undefined);
});

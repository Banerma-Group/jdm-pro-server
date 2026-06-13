function plain(listing) {
  return typeof listing.toJSON === 'function' ? listing.toJSON() : listing;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function titleCase(value) {
  if (!value) return '';
  return String(value)
    .split(/[-\s]/)
    .filter(Boolean)
    .map(word =>
      word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`
    )
    .join(' ');
}

function formatPrice(yen) {
  if (yen == null || yen === '') return null;
  const num = Number(yen);
  if (!Number.isFinite(num)) return null;
  return `¥${num.toLocaleString('en-US')}`;
}

function titleLine(row) {
  return [row.modelYear, titleCase(row.maker), titleCase(row.model)]
    .filter(Boolean)
    .join(' ')
    .trim();
}

// One caption used by both Telegram (html) and Instagram (plain + hashtags).
function buildCaption(listing, { html = false, hashtags = false } = {}) {
  const row = plain(listing);
  const esc = html ? escapeHtml : value => String(value);

  const lines = [];
  const title = titleLine(row);
  if (title) lines.push(html ? `<b>${esc(title)}</b>` : title);

  const facts = [];
  const price = formatPrice(row.totalPrice ?? row.vehiclePrice);
  if (price) facts.push(`💴 ${price}`);
  if (row.mileageKm != null) facts.push(`📏 ${Number(row.mileageKm).toLocaleString('en-US')} km`);
  if (row.transmission) facts.push(`⚙️ ${esc(titleCase(row.transmission))}`);
  if (row.fuelType) facts.push(`⛽ ${esc(titleCase(row.fuelType))}`);
  if (row.prefecture) facts.push(`📍 ${esc(titleCase(row.prefecture))}`);
  if (facts.length) lines.push(facts.join('  '));

  if (row.descriptionTranslated) {
    const desc = String(row.descriptionTranslated).slice(0, 400);
    lines.push('');
    lines.push(esc(desc));
  }

  if (hashtags) {
    const tags = buildHashtags(row);
    if (tags) {
      lines.push('');
      lines.push(tags);
    }
  }

  if (html && row.url) {
    lines.push('');
    lines.push(`<a href="${esc(row.url)}">View source</a>`);
  }

  return lines.join('\n');
}

function buildHashtags(listing) {
  const row = plain(listing);
  const tags = ['jdm', 'usedcars', 'japancars'];
  if (row.maker) tags.push(String(row.maker).replace(/[^a-z0-9]/gi, ''));
  if (row.model) tags.push(String(row.model).replace(/[^a-z0-9]/gi, ''));
  return tags
    .filter(Boolean)
    .map(tag => `#${tag.toLowerCase()}`)
    .join(' ');
}

// Inline keyboard for the Telegram post.
// - autoCreateVehicles on  -> vehicle already exists, show a "View vehicle" url button
// - autoCreateVehicles off -> actionable "Post to vehicles" callback button
function buildKeyboard({ listingId, autoCreateVehicles, vehicleUrl }) {
  const vehicleButton =
    autoCreateVehicles && vehicleUrl
      ? { text: '🚗 View vehicle', url: vehicleUrl }
      : { text: '➕ Post to vehicles', callback_data: `pv:${listingId}` };

  return [[vehicleButton], [{ text: '📸 Post to Instagram', callback_data: `ig:${listingId}` }]];
}

function coverPhoto(listing) {
  const row = plain(listing);
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
  return photos[0] || null;
}

module.exports = {
  buildCaption,
  buildHashtags,
  buildKeyboard,
  coverPhoto,
  formatPrice,
  titleLine,
};

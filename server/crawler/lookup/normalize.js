const HALF_WIDTH_OFFSET = 0xff10;

function halfWidthNumbers(value) {
  return String(value).replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - HALF_WIDTH_OFFSET));
}

function parseYen(text) {
  if (!text) return null;
  const value = halfWidthNumbers(text).replace(/,/g, '');
  const man = value.match(/([\d.]+)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const yen = value.match(/([\d.]+)\s*円/);
  if (yen) return Math.round(parseFloat(yen[1]));
  return /^[\d.]+$/.test(value) ? parseFloat(value) : null;
}

function parseMileageKm(text) {
  if (!text) return null;
  const value = halfWidthNumbers(text).replace(/,/g, '');
  const man = value.match(/([\d.]+)\s*万\s*km/i);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const km = value.match(/([\d.]+)\s*km/i);
  if (km) return Math.round(parseFloat(km[1]));
  return null;
}

function parseInt0(text) {
  if (text == null) return null;
  const match = halfWidthNumbers(text).replace(/,/g, '').match(/-?\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function parseYear(text) {
  if (!text) return null;
  const value = halfWidthNumbers(text);
  const eras = { 令和: 2018, 平成: 1988, 昭和: 1925 };
  for (const [era, base] of Object.entries(eras)) {
    const match = value.match(new RegExp(`${era}\\s*(\\d+)`));
    if (match) return base + parseInt(match[1], 10);
  }
  const year = value.match(/(19|20)\d{2}/);
  return year ? parseInt(year[0], 10) : null;
}

module.exports = {
  parseYen,
  parseMileageKm,
  parseInt0,
  parseYear,
};

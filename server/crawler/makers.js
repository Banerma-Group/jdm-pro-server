const { adapters } = require('./adapters');
const { parseHtml } = require('./dom');
const dictionaries = require('./lookup/dictionaries');
const { debugLog } = require('./shared/debug');

function normalizeDisplayText(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalMakerValue(label) {
  const normalized = normalizeDisplayText(label);
  return dictionaries.maker[label] || dictionaries.maker[normalized] || normalized.toLowerCase();
}

function makerDisplayLabel(value, label) {
  const normalized = normalizeDisplayText(label);
  if (!dictionaries.maker[label] && !dictionaries.maker[normalized]) return normalized;

  return value
    .split('-')
    .map(word => (word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join('-');
}

async function responseText(res, fallbackCharset = 'utf-8') {
  const contentType = res.headers.get('content-type') || '';
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim() || fallbackCharset;
  return new TextDecoder(charset).decode(await res.arrayBuffer());
}

function mergeMakerOptions(siteMakers) {
  const byValue = new Map();

  for (const maker of siteMakers) {
    if (!maker?.label) continue;
    const value = canonicalMakerValue(maker.label);
    const existing = byValue.get(value) || {
      value,
      label: makerDisplayLabel(value, maker.label),
      sites: {},
    };
    if (maker.site && maker.code) existing.sites[maker.site] = maker.code;
    byValue.set(value, existing);
  }

  const options = [
    { value: '', label: 'all makers', sites: {} },
    ...Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  debugLog('crawler.makers.merge', { inputCount: siteMakers.length, optionCount: options.length });
  return options;
}

async function fetchMakerOptions({ fetchImpl = fetch, sites = Object.keys(adapters) } = {}) {
  debugLog('crawler.makers.fetch.start', { sites });
  const results = await Promise.allSettled(
    sites.map(async site => {
      const adapter = adapters[site];
      if (!adapter?.makerListUrl || !adapter?.parseMakerOptions) return [];
      debugLog('crawler.makers.fetch.site.request', { site, url: adapter.makerListUrl });
      const res = await fetchImpl(adapter.makerListUrl);
      if (!res.ok) throw new Error(`${site} maker list returned ${res.status}`);
      const doc = parseHtml(await responseText(res, adapter.makerListCharset));
      const options = adapter.parseMakerOptions(doc);
      debugLog('crawler.makers.fetch.site.response', { site, optionCount: options.length });
      return options;
    })
  );

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      debugLog('crawler.makers.fetch.site.error', { site: sites[index], message: result.reason?.message || String(result.reason) });
    }
  }

  const options = mergeMakerOptions(results.flatMap(result => (result.status === 'fulfilled' ? result.value : [])));
  debugLog('crawler.makers.fetch.done', { optionCount: options.length });
  return options;
}

module.exports = {
  mergeMakerOptions,
  fetchMakerOptions,
};

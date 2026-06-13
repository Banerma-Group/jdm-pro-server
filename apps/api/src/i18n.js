// The Express API never actually called res.__()/req.__() in any route, so this
// is a minimal passthrough kept for parity. If localized responses are added
// later, load translations/<locale>.json here and resolve dotted keys.
const SUPPORTED = ["uz", "ru", "uz-Cyrl"];
const DEFAULT_LOCALE = "uz";

export function resolveLocale(locale) {
  return SUPPORTED.includes(locale) ? locale : DEFAULT_LOCALE;
}

export function t(_locale, key, _vars) {
  return key;
}

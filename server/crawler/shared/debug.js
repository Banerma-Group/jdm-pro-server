const SENSITIVE_KEY = /chatid|telegramchatid|token|secret|password|apikey|authorization/i;

const runtimeEnv = process.env.NODE_ENV;
const debugFlag = process.env.FERUZ_DEBUG_DATA;

const isDebugEnabled = debugFlag === 'true' || (debugFlag !== 'false' && runtimeEnv !== 'production');

function summarizeDebugValue(value, depth = 0, key = '') {
  if (SENSITIVE_KEY.test(key)) return value ? '[set]' : '[empty]';
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return { size: value.size, sample: Array.from(value).slice(0, 5) };
  if (value instanceof URLSearchParams) return Object.fromEntries(value.entries());
  if (depth >= 2) return Array.isArray(value) ? `[array:${value.length}]` : '[object]';

  if (Array.isArray(value)) {
    return {
      length: value.length,
      sample: value.slice(0, 5).map(item => summarizeDebugValue(item, depth + 1)),
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      summarizeDebugValue(entryValue, depth + 1, entryKey),
    ])
  );
}

function debugLog(label, payload = {}) {
  if (!isDebugEnabled) return;
  console.debug(`[debug:${label}]`, summarizeDebugValue(payload));
}

module.exports = {
  isDebugEnabled,
  summarizeDebugValue,
  debugLog,
};

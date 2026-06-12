const dictionaries = require('./dictionaries');

const DICT_FOR = {
  maker: dictionaries.maker,
  color: dictionaries.color,
  transmission: dictionaries.transmission,
  fuelType: dictionaries.fuel,
  bodyType: dictionaries.body,
  drivetrain: dictionaries.drivetrain,
  prefecture: dictionaries.prefecture,
};

async function translateField(field, value, { cache, openai } = {}) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();

  const dict = DICT_FOR[field];
  if (dict && dict[text]) return dict[text];

  const cached = cache ? await cache.get(field, text) : null;
  if (cached) return cached;

  if (openai) {
    try {
      const english = await openai.translate(field, text);
      if (english) {
        if (cache) await cache.set(field, text, english);
        return english;
      }
    } catch (error) {
      console.warn(`[lookup] translateField(${field}) OpenAI error: ${error?.message || error}`);
    }
  }

  return text;
}

module.exports = {
  translateField,
};

const { TranslationCache } = require('../../../db/models');

function createDbCache() {
  return {
    async get(field, sourceText) {
      const row = await TranslationCache.findOne({ where: { field, sourceText } });
      return row?.english || null;
    },
    async set(field, sourceText, english) {
      await TranslationCache.findOrCreate({
        where: { field, sourceText },
        defaults: { field, sourceText, english },
      });
    },
  };
}

module.exports = {
  createDbCache,
};

require('dotenv').config();

const { sequelize, Maker } = require('../db/models');
const { makerDedupeKey } = require('../server/crawler/makers');

// One-time migration: align historical data with the strengthened maker
// canonicalisation. Strips katakana middle dots (・ ･) from listing maker
// values and merges duplicate maker rows that only differed by separator/case
// (e.g. "amc・ジープ" + "amcジープ" → "amcジープ").
async function main() {
  // 1) Normalize the maker stored on every listing so filters keep matching.
  const [, listingMeta] = await sequelize.query(
    `UPDATE listings
       SET maker = replace(replace(maker, '・', ''), '･', '')
     WHERE maker LIKE '%・%' OR maker LIKE '%･%'`
  );
  console.log(`listings.maker normalized: ${listingMeta?.rowCount ?? 0} row(s)`);

  // 2) Rebuild the makers table deduped by canonical key.
  const makers = await Maker.findAll({ raw: true });
  const byKey = new Map();
  for (const maker of makers) {
    const key = makerDedupeKey(maker.value);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.sites = { ...existing.sites, ...(maker.sites || {}) };
      if (!existing.label.includes('・') && String(maker.label).includes('・')) {
        existing.label = maker.label;
      }
    } else {
      byKey.set(key, { value: key, label: maker.label, sites: maker.sites || {} });
    }
  }

  const deduped = Array.from(byKey.values()).map(row => ({ ...row, updatedAt: new Date() }));
  await sequelize.transaction(async transaction => {
    await Maker.destroy({ where: {}, truncate: true, transaction });
    await Maker.bulkCreate(deduped, { transaction });
  });
  console.log(`makers rebuilt: ${makers.length} → ${deduped.length} row(s)`);

  await sequelize.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

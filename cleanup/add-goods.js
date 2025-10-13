require('dotenv').config(); // Load environment variables from .env file
const { Good, Op, Sequelize, sequelize } = require('../db/models');
const Promise = require('bluebird');
const OpenAI = require('openai');
const openai = new OpenAI();

async function parse(text) {
  const json_schema = {
    name: 'driver_info',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            strict: true,
            type: 'object',
            additionalProperties: false,
            uz: {
              type: 'string',
            },
            ru: {
              type: 'string',
            },
            uz_cyrillic: {
              type: 'string',
            },
            en: {
              type: 'string',
            },
            category: {
              enum: Object.values(Good.CARGO_TYPES),
            },
          },
        },
      },
    },
  };

  return openai.beta.chat.completions
    .parse({
      messages: [
        {
          role: 'system',
          content:
            'given list of comma separated goods name mix of uzbek and russian, translate them to russian, uzbek latin, uzbek cyrillic, english and categorize them',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0,
      top_p: 1,
      seed: 525212,
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema },
    })
    .then(({ choices }) => {
      return choices[0].message.parsed.messages;
    });
}

async function fetchAllGoodsInBatches(processor, batchSize = 60, minGoodsCount = 4) {
  let offset = 0; // Start at the beginning of the table
  let hasMore = true;

  while (hasMore) {
    try {
      // Fetch the current batch of goods
      const results = await sequelize.query(
        `
        SELECT trimmed_goods
        FROM goods_summary
        WHERE goods_count < :minGoodsCount
        ORDER BY goods_count DESC
        LIMIT :batchSize
        OFFSET :offset;
      `,
        {
          replacements: { batchSize, offset, minGoodsCount },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      if (results.length === 0) {
        hasMore = false; // No more results, stop the loop
      } else {
        await processor(results);
        offset += batchSize;
      }
    } catch (error) {
      console.error('Error fetching goods:', error);
      hasMore = false; // Stop the loop in case of an error
    }
  }
}

async function main() {
  await fetchAllGoodsInBatches(async function (results) {
    let names = await Promise.map(results, async ({ trimmed_goods }) => {
      let word = trimmed_goods.trim();
      let exist = await Good.count({
        where: {
          [Op.or]: [
            { nameUz: { [Op.iLike]: `${word}` } },
            { nameRu: { [Op.iLike]: `${word}` } },
            { nameCyrl: { [Op.iLike]: `${word}` } },
            { nameEn: { [Op.iLike]: `${word}` } },
          ],
        },
      });
      return exist ? null : word;
    });

    if (!names.length) {
      return;
    }

    let result = await parse(names.filter(Boolean).join(','));
    Promise.map(
      result,
      async ({ uz, ru, en, uz_cyrillic, category }) => {
        category = Object.values(Good.CARGO_TYPES).includes(category) ? category : 'other';
        await sequelize
          .query(
            `
        INSERT INTO goods (name_uz, name_ru, name_cyrl, name_en, category)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `,
            {
              bind: [
                uz.toLowerCase(),
                ru.toLowerCase(),
                uz_cyrillic.toLowerCase(),
                en.toLowerCase(),
                category,
              ],
            }
          )
          .catch(console.log);
      },
      { concurrency: 1 }
    );
  });
}

main();

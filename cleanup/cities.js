require('dotenv').config();

const { Load, Op, Sequelize, sequelize } = require('../db/models');

async function processor() {
  try {
    const ignoreValues = ['не указано', 'unknown', 'none', 'null', 'н/д', 'n/a', 'N/A'];

    // SELECT id, origin_city_name, destination_city_name
    // FROM loads
    // WHERE is_archived = true
    //   AND (
    //         (origin_city_id IS NULL AND origin_country_id IS NULL AND origin_city_name NOT IN (:ignoreValues))
    //      OR (destination_city_id IS NULL AND destination_country_id IS NULL AND destination_city_name IS NOT NULL AND TRIM(LOWER(destination_city_name)) NOT IN (:ignoreValues))
    //   );

    const [loads] = await sequelize.query(
      `
      SELECT id, origin_city_name, destination_city_name
      FROM loads
      WHERE is_archived = false
        AND (origin_city_id IS NULL AND origin_country_id IS NULL AND origin_city_name NOT IN (:ignoreValues));
    `,
      {
        replacements: { ignoreValues: ignoreValues.map(v => v.toLowerCase()) },
      }
    );

    for (const load of loads) {
      console.log(load.id);
      // --- ORIGIN MATCHING ---
      if (!load.origin_city_id && !load.origin_country_id) {
        const [originMatches] = await sequelize.query(
          `
          WITH input AS (
            SELECT :input AS search_term
          )
          SELECT *
          FROM (
            SELECT
              cnv.id,
              cnv.name_variant,
              'city' AS type,
              c.country_id,
              similarity(cnv.name_variant, (SELECT search_term FROM input)) AS sim_score,
              levenshtein(cnv.name_variant, (SELECT search_term FROM input)) AS lev_dist
            FROM city_name_variants cnv
            JOIN cities c ON c.id = cnv.id
            WHERE similarity(cnv.name_variant, (SELECT search_term FROM input)) > 0.6
              AND levenshtein(cnv.name_variant, (SELECT search_term FROM input)) <= 3

            UNION ALL

            SELECT
              cnv.id,
              cnv.name_variant,
              'country' AS type,
              NULL AS country_id,
              similarity(cnv.name_variant, (SELECT search_term FROM input)) AS sim_score,
              levenshtein(cnv.name_variant, (SELECT search_term FROM input)) AS lev_dist
            FROM country_name_variants cnv
            WHERE similarity(cnv.name_variant, (SELECT search_term FROM input)) > 0.6
              AND levenshtein(cnv.name_variant, (SELECT search_term FROM input)) <= 3
          ) AS all_matches
          ORDER BY sim_score DESC, lev_dist ASC
          LIMIT 1;
        `,
          { replacements: { input: load.origin_city_name } }
        );

        const originMatch = originMatches[0];
        if (originMatch) {
          console.log('origin match found: ', originMatch, load);
          if (originMatch.type === 'city') {
            await sequelize.query(
              `
              UPDATE loads
              SET origin_city_id = :city_id,
                  origin_country_id = :country_id
              WHERE id = :load_id
            `,
              {
                replacements: {
                  city_id: originMatch.id,
                  country_id: originMatch.country_id,
                  load_id: load.id,
                },
              }
            );
          } else if (originMatch.type === 'country') {
            await sequelize.query(
              `
              UPDATE loads
              SET origin_country_id = :country_id
              WHERE id = :load_id
            `,
              {
                replacements: {
                  country_id: originMatch.id,
                  load_id: load.id,
                },
              }
            );
          }
        }
      }

      // --- DESTINATION MATCHING ---
      // if (!load.destination_city_id && !load.destination_country_id) {
      //   const [destinationMatches] = await sequelize.query(`
      //     WITH input AS (
      //       SELECT :input AS search_term
      //     )
      //     SELECT *
      //     FROM (
      //       SELECT
      //         cnv.id,
      //         cnv.name_variant,
      //         'city' AS type,
      //         c.country_id,
      //         similarity(cnv.name_variant, (SELECT search_term FROM input)) AS sim_score,
      //         levenshtein(cnv.name_variant, (SELECT search_term FROM input)) AS lev_dist
      //       FROM city_name_variants cnv
      //       JOIN cities c ON c.id = cnv.id
      //       WHERE similarity(cnv.name_variant, (SELECT search_term FROM input)) > 0.6
      //         AND levenshtein(cnv.name_variant, (SELECT search_term FROM input)) <= 3

      //       UNION ALL

      //       SELECT
      //         cnv.id,
      //         cnv.name_variant,
      //         'country' AS type,
      //         NULL AS country_id,
      //         similarity(cnv.name_variant, (SELECT search_term FROM input)) AS sim_score,
      //         levenshtein(cnv.name_variant, (SELECT search_term FROM input)) AS lev_dist
      //       FROM country_name_variants cnv
      //       WHERE similarity(cnv.name_variant, (SELECT search_term FROM input)) > 0.6
      //         AND levenshtein(cnv.name_variant, (SELECT search_term FROM input)) <= 3
      //     ) AS all_matches
      //     ORDER BY sim_score DESC, lev_dist ASC
      //     LIMIT 1;
      //   `, { replacements: { input: load.destination_city_name } });

      //   const destMatch = destinationMatches[0];
      //   if (destMatch) {
      //     console.log('destination match found: ', destMatch, load)
      //     if (destMatch.type === 'city') {
      //       await sequelize.query(`
      //         UPDATE loads
      //         SET destination_city_id = :city_id,
      //             destination_country_id = :country_id
      //         WHERE id = :load_id
      //       `, {
      //         replacements: {
      //           city_id: destMatch.id,
      //           country_id: destMatch.country_id,
      //           load_id: load.id
      //         }
      //       });
      //     } else if (destMatch.type === 'country') {
      //       await sequelize.query(`
      //         UPDATE loads
      //         SET destination_country_id = :country_id
      //         WHERE id = :load_id
      //       `, {
      //         replacements: {
      //           country_id: destMatch.id,
      //           load_id: load.id
      //         }
      //       });
      //     }
      //   }
      // }
    }

    console.log('Origin and destination city/country fields updated.');
  } catch (error) {
    console.error('Update error:', error);
  } finally {
    await sequelize.close();
  }
}

processor();

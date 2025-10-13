const axios = require('axios');
const kebabCase = require('lodash/kebabCase');
const { CityFound, Country, sequelize, Sequelize, Op, City, Load } = require('../../db/models');
const {
  generateCityNames,
  parseLocationDetails,
  parseSingleLocationDetails,
} = require('../services/openai');
const {
  isTurkish,
  turkishTranslite,
  cyrillicTranslite,
  isCyrillic,
  getWordCount,
  tokenizeWithoutSuffixes,
} = require('./strings');
const YAML = require('yaml');
const redisClient = require('../services/redis');
const { createHash } = require('crypto');
const { DAY } = require('time-constants');

const SQL_SINGLE = `
	WITH input AS (
		SELECT :input AS search_term
	),
	variants AS (
		SELECT search_term AS variant FROM input
	),
	raw AS (
		SELECT
			'city' AS type, c.id, c.name_uz, c.name_ru, c.name_variant,
			c.country_id, c.parent_id,
			similarity(c.name_variant, v.variant) AS sim_score,
			levenshtein(c.name_variant, v.variant) AS levenshtein_dist
		FROM city_name_variants c
		CROSS JOIN variants v
		WHERE similarity(c.name_variant, v.variant) > 0.3

		UNION ALL

		SELECT
			'country' AS type, k.id, k.name_uz, k.name_ru, k.name_variant,
			NULL::integer AS country_id, k.parent_id,
			similarity(k.name_variant, v.variant) AS sim_score,
			levenshtein(k.name_variant, v.variant) AS levenshtein_dist
		FROM country_name_variants k
		CROSS JOIN variants v
		WHERE similarity(k.name_variant, v.variant) > 0.3
	),
	dedup AS (
		SELECT DISTINCT ON (type, id)
			type, id, name_uz, name_ru, name_variant, country_id, parent_id,
			sim_score, levenshtein_dist
		FROM raw
		ORDER BY type, id, sim_score DESC, levenshtein_dist ASC
	)
	SELECT *
	FROM dedup
	ORDER BY sim_score DESC, levenshtein_dist ASC
	LIMIT :limit;
`;

// --- SQL: multi-word (generate dashed + nospace variants) -------------
const SQL_MULTI = `
	WITH input AS (
		SELECT
			:input AS search_term,
			regexp_replace(trim(:input), '\\s+', '-', 'g') AS dash_variant,
			regexp_replace(trim(:input), '\\s+', '',  'g') AS nospace_variant
	),
	variants AS (
		SELECT search_term AS variant FROM input
		UNION ALL SELECT dash_variant   FROM input
		UNION ALL SELECT nospace_variant FROM input
	),
	raw AS (
		SELECT
			'city' AS type, c.id, c.name_uz, c.name_ru, c.name_variant,
			c.country_id, c.parent_id,
			similarity(c.name_variant, v.variant) AS sim_score,
			levenshtein(c.name_variant, v.variant) AS levenshtein_dist
		FROM city_name_variants c
		CROSS JOIN variants v
		WHERE similarity(c.name_variant, v.variant) > 0.3

		UNION ALL

		SELECT
			'country' AS type, k.id, k.name_uz, k.name_ru, k.name_variant,
			NULL::integer AS country_id, k.parent_id,
			similarity(k.name_variant, v.variant) AS sim_score,
			levenshtein(k.name_variant, v.variant) AS levenshtein_dist
		FROM country_name_variants k
		CROSS JOIN variants v
		WHERE similarity(k.name_variant, v.variant) > 0.3
	),
	dedup AS (
		SELECT DISTINCT ON (type, id)
			type, id, name_uz, name_ru, name_variant, country_id, parent_id,
			sim_score, levenshtein_dist
		FROM raw
		ORDER BY type, id, sim_score DESC, levenshtein_dist ASC
	)
	SELECT *
	FROM dedup
	ORDER BY sim_score DESC, levenshtein_dist ASC
	LIMIT :limit;
`;

const INVALID_NAMES = ['не указано', 'unknown', 'none', 'null', 'н/д', 'n/a', 'N/A'];
const CITY_FOUNDS_CACHE_KEY = 'city-founds';

const getLatLong = async cityName => {
  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: {
        q: cityName,
        appid: apiKey,
      },
    });

    const { coord } = response.data;
    const lat = coord.lat;
    const long = coord.lon;

    return [lat, long];
  } catch (error) {
    console.error(`Xatolik yuz berdi: ${error}`);
    return null;
  }
};

async function calculateDistanceMatrix(originLat, originLng, destLat, destLng) {
  const apiKey = process.env.GOOGLE_API_KEY;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK') {
    const element = data.rows[0].elements[0];

    const distance = element.distance ? element.distance.value : null; // Metrda
    const duration = element.duration ? element.duration.value : null; // Soniyada

    return {
      distance_meters: distance,
      duration_seconds: duration,
      destination_address: data.destination_addresses[0],
      origin_address: data.origin_addresses[0],
    };
  } else {
    console.error('API request failed with status: ' + data.status);
  }
}

async function getCachedCityNames(name) {
  const cacheKey = `city-names:${createHash('md5').update(name.toLowerCase()).digest('hex')}`;
  let cached;
  try {
    cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Redis error (city names):', err);
  }
  try {
    const result = await generateCityNames(name);
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', (DAY * 30) / 1000);
    return result;
  } catch (err) {
    console.error('generateCityNames error:', err);
    if (cached) {
      return JSON.parse(cached);
    }
    return {
      names: name.toLowerCase(),
      nameUz: name,
      nameEn: name,
      nameRu: name,
    };
  }
}

async function parseLocationDetailsCached(text) {
  const cacheKey = `location-details:${createHash('md5').update(text).digest('hex')}`;
  let cached;
  try {
    cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('Redis error (location details):', err);
  }
  try {
    const result = await parseLocationDetails(text);
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', (DAY * 30) / 1000);
    return result;
  } catch (err) {
    console.error('parseLocationDetails error:', err);
    if (cached) {
      return JSON.parse(cached);
    }
    return [];
  }
}

async function getCityInfo(cityName, originalName) {
  const apiKey = '33c7aca861a14b79989ffcf906568dbc';
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(cityName)}&key=${apiKey}&language=en&limit=5`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      // Prioritized selection: city > town > village > locality
      const priorityMap = {
        city: 1,
        town: 2,
        hamlet: 3,
        village: 4,
        locality: 5,
        neighbourhood: 6,
        country: 7,
      };
      let bestResult = null;
      let bestPriority = Infinity;
      let bestConfidence = -1;
      // let selectedNameType = null;
      let name = null;

      for (const result of data.results) {
        const comp = result.components;
        const type = comp._type;

        if (!type || !(type in priorityMap)) continue;

        const priority = priorityMap[type];
        const confidence = result.confidence || 0;

        let currentName = comp[type];

        // fallback only when that type’s field is missing
        if (!currentName) {
          if (type === 'city' && comp.town) {
            currentName = comp.town;
          } else if (type === 'neighbourhood' && comp.town) {
            currentName = comp.town;
          }
        }

        // if we still don’t have a name, skip it
        if (!currentName) continue;

        const n1 = normalizeName(cityName);
        let n2 = normalizeName(currentName);
        let sim = similarity(n1, n2);

        // if too low similarity, and we have suburb, use that instead
        const SIM_THRESHOLD = 0.5;

        if (sim < SIM_THRESHOLD) {
          if (comp.suburb) {
            n2 = normalizeName(comp.suburb);
            sim = similarity(n1, n2);

            if (sim < SIM_THRESHOLD) {
              continue;
            }

            currentName = comp.suburb;
          } else {
            continue;
          }
        }

        // pick the **lower** priority value first, then higher confidence
        const isBetter =
          priority < bestPriority || (priority === bestPriority && confidence > bestConfidence);

        if (isBetter) {
          bestResult = result;
          bestPriority = priority;
          bestConfidence = confidence;
          name = currentName;
          // selectedNameType = type;
        }
      }

      if (!bestResult || !name) {
        return null;
      }

      const city = bestResult;

      const country = await Country.findOne({
        where: {
          names: {
            [Op.iLike]: `%${kebabCase(city.components.country)}%`,
          },
        },
      });

      if (!country) {
        console.log(`Country not found: ${city.components.country}`);
      }

      const state = city.components.state;
      let parentCity = null;

      if (state) {
        const parent = state.replace(' Oblast', '');
        const possibleCity = await findSimilarCityName(parent);

        if (possibleCity && possibleCity.type === 'city') {
          parentCity = possibleCity;
        }
      }

      if (!name) {
        return null;
      }

      const { names, nameUz, nameEn, nameRu } = await getCachedCityNames(name);

      const cityInfo = {
        name: originalName,
        cleanName: cityName,
        latlng: [city.geometry.lat, city.geometry.lng],
        country_id: country?.id,
        parent_id: parentCity?.id,
        names,
        nameUz,
        nameEn,
        nameRu,
        locationType: city.components._type === 'country' ? 'country' : 'city',
        googlePlaceId: city.annotations.geohash,
      };

      // console.log('test-new-city-info: ', cityInfo.name);

      return cityInfo;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

function shouldAcceptRow(name, row) {
  const sim = parseFloat(row.sim_score);
  const dist = parseInt(row.levenshtein_dist, 10);
  const words = name.trim().split(/\s+/).length;

  if (name.length >= 36 || name.trim().split(/\s+/).length > 3) return;

  if (words === 1) return sim > 0.3 && dist <= 3;
  if (words === 2) return sim > 0.3 && dist <= 12;
  /* else 3+ words */ return sim >= 0.43 && dist <= 15;
}

async function fetchTopUnknownCityNames(cachedNames = []) {
  const query = `
    WITH combined AS (
      SELECT
        origin_city_name AS name,
        COUNT(*) AS repeat_count,
        'origin' AS type
      FROM loads
      WHERE origin_city_id IS NULL
        AND origin_country_id IS NULL
        AND origin_city_name IS NOT NULL
        AND TRIM(origin_city_name) <> ''
        AND CHAR_LENGTH(TRIM(origin_city_name)) > 1          -- not single char
        AND TRIM(origin_city_name) !~ '^[0-9]+$'             -- not digits-only
        AND origin_city_name NOT IN (:invalid)
        AND origin_city_name NOT IN (:cached)
        AND CHAR_LENGTH(origin_city_name) < 35
      GROUP BY origin_city_name

      UNION ALL

      SELECT
        destination_city_name AS name,
        COUNT(*) AS repeat_count,
        'destination' AS type
      FROM loads
      WHERE destination_city_id IS NULL
        AND destination_country_id IS NULL
        AND destination_city_name IS NOT NULL
        AND TRIM(destination_city_name) <> ''
        AND CHAR_LENGTH(TRIM(destination_city_name)) > 1     -- not single char
        AND TRIM(destination_city_name) !~ '^[0-9]+$'        -- not digits-only
        AND destination_city_name NOT IN (:invalid)
        AND destination_city_name NOT IN (:cached)
        AND CHAR_LENGTH(destination_city_name) < 35
      GROUP BY destination_city_name
    )
    SELECT *
    FROM combined
    ORDER BY repeat_count DESC
    LIMIT 10;
  `;

  const [rows] = await sequelize.query(query, {
    replacements: {
      invalid: INVALID_NAMES,
      cached: cachedNames.length ? cachedNames : [''], // avoid empty-list syntax issue
    },
  });
  return rows;
}

async function generateCities() {
  const existingCount = await CityFound.count();
  if (existingCount > 500) return;

  console.log('start - generateCities');

  const cachedNames = await redisClient.smembers(CITY_FOUNDS_CACHE_KEY);

  console.log('cachedNamesLength', cachedNames.length);

  try {
    const results = await fetchTopUnknownCityNames(cachedNames);
    for (const row of results) {
      await processCityRow(row);
    }
    console.log('✅ Finished generateCities');
  } catch (error) {
    console.error('❌ Unable to generate cities:', error);
  }
}

// Process each city‐name row from the query
async function processCityRow({ name, repeat_count }) {
  console.log(`🌎 Processing city: ${name} (count: ${repeat_count})`);
  const cleanName = normalizePlace(name);

  if (await CityFound.findOne({ where: { name: { [Op.iLike]: name } } })) {
    console.log(`  • Already recorded: ${name}`);
    await redisClient.sadd(CITY_FOUNDS_CACHE_KEY, name);
    return;
  }

  const bestMatch = await findSimilarCityName(cleanName);

  if (bestMatch) {
    const accepted = shouldUseLocalMatch(
      cleanName,
      bestMatch.sim_score,
      bestMatch.levenshtein_dist
    );

    if (accepted) {
      return createOrRecord(cleanName, name, bestMatch);
    } else {
      const fb = shouldSuggestTwoWordFallback(cleanName, bestMatch.levenshtein_dist);
      if (fb.suggest) {
        const c1 = await findSimilarCityName(fb.parts[0]);
        const c2 = await findSimilarCityName(fb.parts[1]);
        const pass1 = shouldUseLocalMatch(
          c1?.name ?? '',
          c1?.sim_score ?? 0,
          c1?.levenshtein_dist ?? Infinity
        );
        const pass2 = shouldUseLocalMatch(
          c2?.name ?? '',
          c2?.sim_score ?? 0,
          c2?.levenshtein_dist ?? Infinity
        );
        if (pass1 || pass2) {
          // accept the match
          return createOrRecord(cleanName, name, bestMatch);
        }
      }
    }
  }

  const cityInfo = await getCityInfo(cleanName, name);

  if (!cityInfo) {
    console.log(`• No city info found – recording as CityFound ${name}`);
    return createOrRecord(cleanName, name, bestMatch);
  }

  console.log(`• Found cityInfo: ${cityInfo.name}`);
  const isSimple = cleanName.length < 36 && cleanName.trim().split(/\s+/).length <= 3;

  if (isSimple) {
    await moveToCities(cityInfo);
  } else {
    await CityFound.create(cityInfo);
    await redisClient.sadd(CITY_FOUNDS_CACHE_KEY, name);
  }
}

// Decide whether to create/update an entity or just record the raw name
async function createOrRecord(cleanName, originalName, match = {}) {
  const id = match?.id;
  const type = match?.type || null;
  const baseData = { name: originalName, cleanName, locationType: type };

  // If no match at all, just record
  if (!id) {
    await redisClient.sadd(CITY_FOUNDS_CACHE_KEY, originalName);
    return CityFound.create(baseData);
  }

  const { sim_score, levenshtein_dist, country_id: matchCountry } = match;

  const meetsCriteria = shouldAcceptRow(cleanName, match);

  // If we can merge into existing entity
  if (meetsCriteria) {
    await mergeIntoEntity(id, type, cleanName, originalName);
  } else {
    // record with similarity metadata
    await redisClient.sadd(CITY_FOUNDS_CACHE_KEY, originalName);
    return CityFound.create({
      ...baseData,
      city_id: type === 'city' ? id : null,
      country_id: type === 'country' ? id : matchCountry || null,
      simScore: sim_score,
      levenshteinDist: levenshtein_dist,
    });
  }
}

// Merge the cleanName into an existing City or Country, then update loads
async function mergeIntoEntity(entityId, matchType, cleanName, originalName) {
  const Model = matchType === 'city' ? City : Country;
  const entity = await Model.findByPk(entityId);
  if (!entity) return;

  const namesList = (entity.names || '')
    .split(',')
    .map(n => n.trim().toLowerCase())
    .filter(Boolean);
  const cleanWords = cleanName.toLowerCase().split(/\s+/);

  const needsNameUpdate = cleanWords.every(w => !namesList.includes(w)) && cleanWords.length === 1;
  if (needsNameUpdate) {
    await entity.update({ names: [...namesList, cleanWords[0]].join(',') });
    console.log(`  • Updated names for ${matchType} ${entityId}`);
  }

  // Update related loads: city case sets both IDs, country case only country_id
  await updateRelatedLoads(
    {
      name: originalName,
      country_id: matchType === 'city' ? entity.country_id : entity.id,
      locationType: matchType,
    },
    entityId
  );
}

async function moveToCities(cityInfo) {
  const { name, names, nameUz, nameRu, nameEn, country_id, locationType, latlng, parent_id } =
    cityInfo;

  console.log(`Moving ${name} directly to table`);

  const entityData = {
    names,
    nameUz,
    nameRu,
    nameEn,
    parent_id,
  };

  let newEntity = null;
  let Model = null;

  if (locationType === 'city') {
    Model = City;
  } else if (locationType === 'country') {
    Model = Country;
  } else {
    console.warn(`Unknown locationType "${locationType}" for "${name}"`);
    return;
  }

  try {
    // Check if entity already exists by one of the localized names
    const existing = await Model.findOne({
      where: {
        [Op.or]: [{ nameUz }, { nameRu }, { nameEn }],
      },
    });

    if (existing) {
      console.log(`${locationType} "${nameRu}" already exists. Skipping creation.`);
      await updateRelatedLoads(cityInfo, existing.id);
      return;
    }

    if (locationType === 'city') {
      newEntity = await City.create({
        ...entityData,
        latlng,
        country_id,
      });
    } else {
      newEntity = await Country.create(entityData);
    }

    console.log(`${locationType} "${nameRu}" has been transferred to the ${locationType} table.`);

    await updateRelatedLoads(cityInfo, newEntity.id);
  } catch (createError) {
    console.error(`Failed to create new ${locationType} "${nameRu}":`, createError);
    return;
  }
}

async function updateRelatedLoads(placeInfo, entityId) {
  const { name, country_id, locationType } = placeInfo;

  const nameMatch = {
    [Op.or]: [{ origin_city_name: name }, { destination_city_name: name }],
  };

  const nullIdMatch =
    locationType === 'city'
      ? {
          [Op.or]: [{ origin_city_id: null }, { destination_city_id: null }],
        }
      : {
          [Op.or]: [{ origin_country_id: null }, { destination_country_id: null }],
        };

  try {
    const relatedLoads = await Load.findAll({
      where: {
        [Op.and]: [nameMatch, nullIdMatch],
      },
    });

    await Promise.all(
      relatedLoads.map(async load => {
        const updateData = {};

        // City case: set both city_id and country_id
        if (locationType === 'city') {
          if (load.originCityName === name) {
            updateData.origin_city_id = entityId;
            updateData.origin_country_id = country_id;
          }
          if (load.destinationCityName === name) {
            updateData.destination_city_id = entityId;
            updateData.destination_country_id = country_id;
          }
        }

        // Country case: only set the country_id
        else if (locationType === 'country') {
          if (load.originCityName === name) {
            updateData.origin_country_id = entityId;
          }
          if (load.destinationCityName === name) {
            updateData.destination_country_id = entityId;
          }
        }

        // if there's anything to update, do it
        if (Object.keys(updateData).length > 0) {
          await load.update(updateData);
          console.log(`Updated load ID ${load.id}:`, updateData);
        }
      })
    );
  } catch (err) {
    console.error(`Failed to update related loads for "${name}" [${locationType}]:`, err);
  }
}

async function processNewCities() {
  try {
    const foundedPlaces = await CityFound.findAll({
      where: {
        accept: { [Op.ne]: null },
      },
    });

    for (const place of foundedPlaces) {
      const {
        name,
        names,
        accept,
        nameUz,
        nameRu,
        nameEn,
        city_id,
        country_id,
        locationType,
        latlng,
        parent_id,
        simScore,
        levenshteinDist,
      } = place;

      if (accept === true) {
        const isMatched = simScore !== null && levenshteinDist !== null;

        const entityData = {
          names,
          nameUz,
          nameRu,
          nameEn,
          parent_id,
        };

        let existingEntity = null;
        let newEntity = null;
        let Model = null;

        if (locationType === 'city') {
          Model = City;
        } else if (locationType === 'country') {
          Model = Country;
        } else {
          console.warn(`Unknown locationType "${locationType}" for "${name}"`);
          continue;
        }

        if (isMatched) {
          try {
            if (city_id && locationType === 'city') {
              existingEntity = await City.findByPk(city_id);
            } else if (country_id && locationType === 'country') {
              existingEntity = await Country.findByPk(country_id);
            }

            if (existingEntity) {
              const existingNames = existingEntity.names || '';
              if (!existingNames.split(',').includes(name)) {
                await existingEntity.update({
                  names: existingNames ? `${existingNames},${name}` : name,
                });
                console.log(`${locationType} "${name}" - names column updated!`);
              } else {
                console.log(`${locationType} "${name}" already present in names. Skipping update.`);
              }
            }
          } catch (error) {
            console.error(`Failed to update existing ${locationType} "${name}":`, error);
            continue;
          }
        } else {
          try {
            // Check if entity already exists by one of the localized names
            const existing = await Model.findOne({
              where: {
                [Op.or]: [{ nameUz }, { nameRu }, { nameEn }],
              },
            });

            if (existing) {
              console.log(`${locationType} "${nameRu}" already exists. Skipping creation.`);
              await place.destroy();
              continue;
            }

            if (locationType === 'city') {
              newEntity = await City.create({
                ...entityData,
                latlng,
                country_id,
              });
            } else {
              newEntity = await Country.create(entityData);
            }

            console.log(
              `${locationType} "${nameRu}" has been transferred to the ${locationType} table.`
            );
          } catch (createError) {
            console.error(`Failed to create new ${locationType} "${nameRu}":`, createError);
            try {
              await place.update({ accept: false });
              console.log(`Set accept=false for failed ${locationType} "${nameRu}"`);
            } catch (updateError) {
              console.error(`Failed to set accept=false for "${nameRu}":`, updateError);
            }
            continue;
          }
        }

        // Update related loads
        await updateRelatedLoads(place, newEntity?.id || existingEntity?.id);

        await place.destroy();
      } else if (accept === false && name) {
        try {
          const loadsToDelete = await Load.findAll({
            where: {
              [Op.or]: [{ origin_city_name: name }, { destination_city_name: name }],
            },
          });

          await Promise.all(
            loadsToDelete.map(async load => {
              await load.destroy();
              console.log(`Deleted load with ID ${load.id} referencing city "${name}".`);
            })
          );

          await place.destroy();
          console.log(`City "${name}" (rejected) removed!`);
        } catch (rejectError) {
          console.error(`Error removing loads for rejected city "${name}":`, rejectError);
        }
      }
    }

    console.log('Finished processNewCities job');
  } catch (error) {
    console.error('Error processing cities:', error);
  }
}

// INDEX KEY
const redisIndexKey = 'processed_load_index';

async function getAliveProcessedLoadIds() {
  const keys = await redisClient.smembers(redisIndexKey);
  const pipeline = redisClient.pipeline();

  keys.forEach(key => pipeline.ttl(key));
  const ttlResults = await pipeline.exec();

  const aliveKeys = keys.filter((_, i) => ttlResults[i][1] > 0);
  const ids = aliveKeys.map(key => key.replace('processed_load:', ''));

  return ids;
}

// Clean dead keys from index
async function cleanDeadKeysFromIndex() {
  const keys = await redisClient.smembers(redisIndexKey);
  const pipeline = redisClient.pipeline();

  keys.forEach(key => pipeline.exists(key));
  const existsResults = await pipeline.exec();

  const deadKeys = keys.filter((_, i) => existsResults[i][1] === 0);
  if (deadKeys.length > 0) {
    await redisClient.srem(redisIndexKey, ...deadKeys);
  }
}

async function processLongCityNameLoads() {
  const count = await CityFound.count();

  if (count > 500) return;

  console.log('start - processLongCityNameLoads');

  try {
    const redisTTL = 60 * 60 * 24 * 4; // 4 days in seconds
    const excludeIds = await getAliveProcessedLoadIds();

    let replacements = [];
    let excludeClause = '';

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ');
      excludeClause = ` AND id NOT IN (${placeholders})`;
      replacements = excludeIds;
    }

    const query = `
      SELECT
        id,
        CASE
          WHEN origin_city_id IS NULL AND origin_country_id IS NULL AND LENGTH(origin_city_name) > 35
              THEN origin_city_name
          WHEN destination_city_id IS NULL AND destination_country_id IS NULL AND LENGTH(destination_city_name) > 35
              THEN destination_city_name
        END AS name
      FROM
        loads
      WHERE
        (
          (origin_city_id IS NULL AND origin_country_id IS NULL AND LENGTH(origin_city_name) > 35)
          OR
          (destination_city_id IS NULL AND destination_country_id IS NULL AND LENGTH(destination_city_name) > 35)
        )
        ${excludeClause}
      LIMIT 20;
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const yamlOutput = YAML.stringify(results);
    const parsedLocations = await parseLocationDetailsCached(yamlOutput);

    for (const location of parsedLocations) {
      // console.log('location: ', location);
      const load = await Load.findByPk(location.id);
      const name = location.city || location.street || location.state;

      const existingCity = await City.findOne({
        where: {
          names: {
            [Op.iLike]: `%${kebabCase(name.toLowerCase())}%`,
          },
        },
      });

      if (!existingCity) {
        const cityInfo = await getCityInfo(name, location.name);

        let params = cityInfo || { name };
        await CityFound.findOrCreate({
          where: { name },
          defaults: params,
        });
      } else {
        const updateData = {};

        if (!load.origin_country_id) {
          updateData.origin_city_id = existingCity.id;
          updateData.origin_country_id = existingCity.country_id;
        } else {
          updateData.destination_city_id = existingCity.id;
          updateData.destination_country_id = existingCity.country_id;
        }

        console.log('update load ', location.id);
        await load.update(updateData);
      }

      // ✅ Mark as processed with TTL and index it
      const redisKey = `processed_load:${location.id}`;
      await redisClient.set(redisKey, '1', 'EX', redisTTL);
      await redisClient.sadd(redisIndexKey, redisKey);
    }

    // Clean expired keys from index
    await cleanDeadKeysFromIndex();
    console.log('Finished');
  } catch (error) {
    console.error('❌ Failed processing location:', error);
  }
}

function shouldUseLocalMatch(cityName, simScore, levenshteinDist) {
  const len = cityName ? cityName.length : 0;

  if (len <= 4) {
    return simScore >= 0.6 && levenshteinDist <= 1;
  }
  if (levenshteinDist > 4) return false;

  if (simScore >= 0.33 && levenshteinDist <= 4) return true;
  if (simScore >= 0.3 && levenshteinDist <= 3) return true;

  return false;
}

function shouldSuggestTwoWordFallback(cityName, levenshteinDist) {
  if (typeof cityName !== 'string') return { suggest: false };

  const words = cityName.trim().split(/\s+/);
  const isTwoWords = words.length === 2;

  // "Clearly too far" threshold
  const looksTooNoisy = levenshteinDist >= 8;

  if (isTwoWords && looksTooNoisy) {
    return { suggest: true, parts: words };
  }
  return { suggest: false };
}

async function findSimilarCityName(text, skipTranslite = false, resultCount = 1) {
  let cleaned = (text || '').trim();
  if (!cleaned) return null;

  cleaned = cleaned.toLowerCase().replace(/w/g, 'sh').replace("'", '`');
  cleaned = cleaned
    .split(' ')
    .map(word => word.trim())
    .filter(word => word.length > 0)
    .map(word => word.replace(/\b(dan|ga|дан|га)\b/gi, ''))
    .filter(word => word.length > 0)
    .join(' ');

  const isSingleWord = getWordCount(cleaned) === 1;
  const sql = isSingleWord ? SQL_SINGLE : SQL_MULTI;

  const cacheKey = `similar-city:${createHash('md5').update(cleaned).digest('hex')}`;

  try {
    if (resultCount === 1) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const results = await sequelize.query(sql, {
      replacements: { input: cleaned, limit: resultCount },
      type: Sequelize.QueryTypes.SELECT,
    });

    let result = null;

    if (results.length > 0) {
      result = {
        id: results[0].id,
        name: results[0].name_uz,
        name_uz: results[0].name_uz,
        name_ru: results[0].name_ru,
        type: results[0].type,
        name_variant: results[0].name_variant.split(/[\s-]+/),
        country_id: results[0].country_id,
        parent_id: results[0].parent_id,
        sim_score: results[0].sim_score,
        levenshtein_dist: results[0].levenshtein_dist,
      };
    } else if (!skipTranslite) {
      if (isCyrillic(cleaned)) {
        result = await findSimilarCityName(cyrillicTranslite(cleaned), true);
      } else if (isTurkish(cleaned)) {
        result = await findSimilarCityName(turkishTranslite(cleaned), true);
      }
    }

    if (result && resultCount === 1) {
      redisClient.set(cacheKey, JSON.stringify(result), 'EX', (DAY * 30) / 1000);
    }

    return resultCount === 1 ? result : results;
  } catch (err) {
    console.error('Database query failed:', err);
  }
  return null;
}

const uniq = arr => [...new Set(arr)];
const wc = s => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);

async function findBestFromVariants(variants) {
  const results = await Promise.all(
    variants.map(async v => {
      if (!v) return null;
      const r = await findSimilarCityName(v.toLowerCase());
      // console.log(v, r);
      return r ? { ...r, _matched_variant: v, _matched_words: wc(v) } : null;
    })
  );
  return results.filter(Boolean);
}

async function splitAndFindCity(text, fallback) {
  const tokens = tokenizeWithoutSuffixes(text);
  if (tokens.length === 0 || tokens.length > 5) return fallback || null;

  // Generate variants based on your DB format rules
  function makeVariants(str) {
    if (!str) return [];
    const parts = str.trim().split(/\s+/);
    if (parts.length > 1) {
      // Multi-word → only dashed & merged
      return [parts.join('-'), parts.join('')];
    }
    // Single word → as-is
    return [str];
  }

  // 1️⃣ Collect all variants with their tiers
  const allVariants = [];

  // Tier 1: Full phrase
  makeVariants(tokens.join(' ')).forEach(v => allVariants.push({ variant: v, tier: 'phrase' }));

  // Tier 2: Multi-word n-grams (skip if same length as full phrase)
  for (let n = Math.min(tokens.length, 4); n >= 2; n--) {
    if (n === tokens.length) continue; // avoid duplicate of full phrase
    for (let i = 0; i + n <= tokens.length; i++) {
      const g = tokens.slice(i, i + n).join(' ');
      makeVariants(g).forEach(v => allVariants.push({ variant: v, tier: 'ngram' }));
    }
  }

  // Tier 3: Single tokens
  uniq(tokens).forEach(token => {
    makeVariants(token).forEach(v => allVariants.push({ variant: v, tier: 'single' }));
  });

  // 2️⃣ Deduplicate variants before DB search
  const seenVariants = new Set();
  const uniqueVariants = allVariants.filter(v => {
    if (seenVariants.has(v.variant)) return false;
    seenVariants.add(v.variant);
    return true;
  });

  // 3️⃣ Query DB for each unique variant
  const candidates = [];
  for (const { variant, tier } of uniqueVariants) {
    const results = await findBestFromVariants([variant]);
    results.forEach(r => {
      r._tier = tier;
      r._matched_variant = variant;
      candidates.push(r);
    });
  }

  // Add fallback if provided
  if (fallback) {
    fallback._tier = 'fallback';
    candidates.push(fallback);
  }

  // 4️⃣ Deduplicate by keeping best per (type, id)
  const grouped = {};
  for (const c of candidates) {
    const key = `${c.type}_${c.id}`;
    if (!grouped[key]) {
      grouped[key] = c;
    } else {
      const current = grouped[key];
      if (
        c.sim_score > current.sim_score ||
        (c.sim_score === current.sim_score && c.levenshtein_dist < current.levenshtein_dist)
      ) {
        grouped[key] = c;
      }
    }
  }

  const EPS = 0.1;

  const isCountryOf = (city, country) => {
    if (city.type !== 'city' || country.type !== 'country') return false;
    // if you ever had legacy data in parent_id, the nullish coalescing keeps it safe
    const cid = city.country_id ?? city.parent_id ?? null;
    return cid != null && cid === country.id;
  };

  const deduped = Object.values(grouped);

  // 5️⃣ Priority sorting
  deduped.sort((a, b) => {
    // 1) Prefer higher similarity first
    const diff = (b.sim_score ?? 0) - (a.sim_score ?? 0);
    if (Math.abs(diff) > EPS) return diff;

    // 2) If scores are close (< EPS), and it's a city-country pair, prefer the city
    if (isCountryOf(a, b)) return -1;
    if (isCountryOf(b, a)) return 1;

    // 3) Fall back to your existing tie-breakers
    if (a.type === 'city' && b.type !== 'city') return -1;
    if (b.type === 'city' && a.type !== 'city') return 1;

    if (a.parent_id && !b.parent_id) return -1;
    if (!a.parent_id && b.parent_id) return 1;

    // optional: finer tie-breaks if you already compute them
    if (a.levenshtein_dist !== b.levenshtein_dist) {
      return a.levenshtein_dist - b.levenshtein_dist;
    }

    return 0;
  });

  // 6️⃣ Logging
  // console.log(`\n[splitAndFindCity] Input: "${text}"`);
  // console.log(`Tokens:`, tokens);
  // console.log(`Unique variants generated (${uniqueVariants.length}):`, uniqueVariants);
  // console.log(`Candidates found (${deduped.length} unique after best-per-id):`);
  // deduped.forEach((c, i) => {
  //   console.log(
  //     `${i + 1}. ${c.name} [${c.type}] id=${c.id}, parent_id=${c.parent_id}, ` +
  //       `sim=${c.sim_score.toFixed(3)}, lev=${c.levenshtein_dist}, tier=${c._tier}, ` +
  //       `matched="${c._matched_variant || ''}"`
  //   );
  // });
  // console.log(`Selected:`, deduped[0]);

  return deduped[0] || null;
}

async function chooseBestLocation(details) {
  const priorityFields = ['village', 'city', 'district', 'state', 'country'];
  const candidates = [];

  const fieldPromises = priorityFields.map(async (field, i) => {
    const text = details[field];
    if (text) {
      const match = await findSimilarCityName(text);
      if (match) {
        return { ...match, priority: i };
      }
    }
    return null;
  });

  const results = await Promise.all(fieldPromises);
  candidates.push(...results.filter(Boolean));

  if (candidates.length === 0 && details.other) {
    const otherMatch = await findSimilarCityName(details.other);
    if (otherMatch) {
      candidates.push({ ...otherMatch, priority: priorityFields.length }); // lowest priority
    }
  }

  if (candidates.length === 0) return null;

  // Step 2: Find best match by similarity score
  candidates.sort((a, b) => b.sim_score - a.sim_score || a.levenshtein_dist - b.levenshtein_dist);
  const bestByScore = candidates[0];
  // console.log('bestByScore: ', candidates);

  // Step 3: Find best by priority (lowest priority index)
  candidates.sort((a, b) => a.priority - b.priority || b.sim_score - a.sim_score);
  const bestByPriority = candidates[0];
  // console.log('bestByPriority: ', candidates);

  // Step 4: Decide which to pick
  // Define what "much higher" similarity means, e.g. 0.1 difference
  const SIMILARITY_DIFF_THRESHOLD = 0.1;

  if (bestByScore.sim_score - bestByPriority.sim_score > SIMILARITY_DIFF_THRESHOLD) {
    return bestByScore;
  } else {
    return bestByPriority;
  }
}

const processLocationDetails = async location => {
  if (!location || getWordCount(location) <= 2) return null;
  const details = await parseSingleLocationDetails(location);
  console.log('AI::[parseSingleLocationDetails] ', details);
  return (await chooseBestLocation(details)) || null;
};

async function parseDestinationNames(destinations = []) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return { destination_names: [], destination_city_ids: [], destination_country_ids: [] };
  }

  // Normalize/trim destination suffixes
  const clean = destinations.map(d =>
    (d ?? '')
      .replace(
        /(ga|га| га| ga|gacha| томонларга| tomonga| tomonlarga| tarafga| taraflarga| TARAFLAGA)$/,
        ''
      )
      .trim()
  );

  // Resolve a single destination (AI-first, then fallbacks)
  const resolveDestination = async destination => {
    if (!destination) return null;

    let entity = await processLocationDetails(destination);

    if (!entity) {
      const fallback = await findSimilarCityName(destination);
      entity = await splitAndFindCity(destination, fallback);
    }

    if (!entity) return null;

    // Normalize to a minimal shape we need downstream
    if (entity.type === 'city') {
      return {
        kind: 'city',
        city_id: entity.id ?? null,
        country_id: entity.country_id ?? null,
      };
    }
    // Treat anything else as a country-level match
    return {
      kind: 'country',
      country_id: entity.id ?? null,
    };
  };

  // Resolve all destinations in parallel
  const resolved = await Promise.all(clean.map(resolveDestination));

  // Deduplicate by IDs while capturing the first input name per unique entity
  const seenCityIds = new Set();
  const seenCountryIds = new Set();
  const entityKeySeen = new Set(); // 'city:<id>' or 'country:<id>'

  const destinationCityNames = [];
  const destinationCityIds = [];
  const destinationCountryIds = []; // keep the requested key spelling

  resolved.forEach((res, idx) => {
    if (!res) return;

    // Build a stable entity key for "first occurrence" naming
    const key =
      res.kind === 'city' && res.city_id != null
        ? `city:${res.city_id}`
        : res.kind === 'country' && res.country_id != null
          ? `country:${res.country_id}`
          : null;

    if (key && !entityKeySeen.has(key)) {
      entityKeySeen.add(key);
      // Only include names that actually resolved
      destinationCityNames.push(destinations[idx]);
    }

    if (res.kind === 'city' && res.city_id != null && !seenCityIds.has(res.city_id)) {
      seenCityIds.add(res.city_id);
      destinationCityIds.push(res.city_id);
    }

    // Always gather country IDs:
    // - from city.country_id
    // - from standalone country matches
    const cid = res.country_id ?? null;
    if (cid != null && !seenCountryIds.has(cid)) {
      seenCountryIds.add(cid);
      destinationCountryIds.push(cid);
    }
  });

  return { destinationCityNames, destinationCityIds, destinationCountryIds };
}

/**
 * Normalize a place name:
 *  - Transliterate if needed
 *  - Lowercase
 *  - Replace runs of spaces/dashes/underscores with a single space
 *  - Strip out other punctuation if you like (here we keep letters/numbers/spaces)
 */
function normalizeName(raw) {
  let s = raw;
  if (isCyrillic(s)) {
    s = cyrillicTranslite(s);
  }
  s = s.toLowerCase();
  // collapse any combination of spaces, dashes, underscores into one space
  s = s.replace(/[\s\-_]+/g, ' ');
  // remove any character that isn’t a letter, digit, or space
  s = s.replace(/[^a-z0-9 ]+/g, '');
  return s.trim();
}

/**
 * Normalize a place name:
 * 1. Lowercase everything
 * 2. Remove standalone “р-он” and “р-н”
 * 3. Turn any non‑letter (Unicode) and non‑ʻ/'/` into spaces
 * 4. Trim ends and collapse multiple spaces to one
 * 5. If the last word ends exactly with “дан” or “dan”, strip that suffix
 * 6. Replace any leftover ʻ, apostrophe or backtick with spaces, then collapse spaces again
 */
function normalizePlace(text) {
  let s = text.toLowerCase();

  // 2) strip out exact words “р-он” and “р-н”
  s = s.replace(/\bр-он\b/g, '').replace(/\bр-н\b/g, '');

  // 3) keep only letters (\p{L}), ʻ, apostrophe, backtick; everything else → space
  // s = s.replace(/[^\p{L}\p{M}\u02BC\u02BB'`]+/gu, ' ');
  s = s.replace(/[^\p{L}\p{M}]+/gu, ' ');

  // 4) trim and collapse spaces
  s = s.trim().replace(/\s+/g, ' ');

  // 5) remove trailing “дан” or “dan” from the last word only
  const parts = s.split(' ');
  if (parts.length) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/(дан|dan)$/i, '');
    if (parts[parts.length - 1] === '') {
      parts.pop();
    }
  }
  s = parts.join(' ');

  // 6) turn any ʻ, apostrophe or backtick into empty string, then collapse spaces
  s = s
    // .replace(/[ʻ'`]+/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  return s;
}

/**
 * Compute Levenshtein distance between two strings
 */
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array(m + 1)
    .fill()
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Turn distance into a 0..1 similarity
 */
function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

const haversine = (lat1, lon1, lat2, lon2) => {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371; // Yer radiusi (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

module.exports = {
  findSimilarCityName,
  getLatLong,
  calculateDistanceMatrix,
  generateCities,
  processNewCities,
  processLongCityNameLoads,
  haversine,
  parseDestinationNames,
  processLocationDetails,
  splitAndFindCity,
};

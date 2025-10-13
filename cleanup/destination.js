require('dotenv').config();

const { Load, Op } = require('../db/models');
const { updateLoads } = require('./index');
const { findSimilarCityName } = require('../server/utils/geocoding');

async function processor({ originCityName, destinationCityName, id }) {
  let json = {};
  let [departure, arrival] = await Promise.all([
    findSimilarCityName(originCityName),
    findSimilarCityName(destinationCityName),
  ]);

  if (departure) {
    if (departure.type === 'city') {
      json.origin_city_id = departure.id;
      json.origin_country_id = departure.country_id;
    } else {
      json.origin_country_id = departure.id;
    }
  }

  if (arrival) {
    if (arrival.type === 'city') {
      json.destination_city_id = arrival.id;
      json.destination_country_id = arrival.country_id;
    } else {
      json.destination_country_id = arrival.id;
    }
  }

  if (departure || arrival) {
    await Load.update(json, { where: { id } });
  }
}

async function main() {
  const query = {
    where: {
      [Op.and]: [
        { origin_city_id: { [Op.is]: null } },
        { origin_country_id: { [Op.is]: null } },
        // { destination_city_id: { [Op.is]: null } },
        // { destination_country_id: { [Op.is]: null } },
      ],
    },
    raw: true,
    limit: 100,
  };

  await updateLoads(query, processor);
}

main();

const { Load, City, Op } = require('../../db/models'); // Adjust the path to your Load model

async function findAllChildrenCities(cityId) {
  // Fetch all immediate child cities for the given cityId
  let childCities = await City.findAll({
    where: { parent_id: cityId },
    attributes: ['id'],
    raw: true,
  });

  // If no children are found, return an empty array
  if (childCities.length === 0) {
    return [];
  }

  // Initialize an array to hold all children, including recursive results
  let allChildren = [...childCities];

  // Recursively fetch children for each of the child cities
  for (let city of childCities) {
    let nestedChildren = await findAllChildrenCities(city.id);
    allChildren = allChildren.concat(nestedChildren);
  }

  return allChildren.map(({ id }) => id).filter(Boolean);
}

async function getPricePerKiloStatistics(originCityId, destinationCityId, withChildren = true) {
  // Calculate the date four months ago from today
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 2);

  const [childrenCities1, childrenCities2] = await Promise.all([
    withChildren ? findAllChildrenCities(originCityId) : [],
    withChildren ? findAllChildrenCities(destinationCityId) : [],
  ]);

  let originCityIds = [originCityId, ...childrenCities1];
  let destinationCityIds = [destinationCityId, ...childrenCities2];

  const loadsData = await Load.findAll({
    where: {
      origin_city_id: originCityIds,
      destination_city_id: destinationCityIds,
      created_at: {
        [Op.gte]: threeMonthsAgo,
      },
      duplication_counter: {
        [Op.lt]: 200,
      },
      price: {
        [Op.ne]: null,
        [Op.gt]: 1000000,
      },
      weight: {
        [Op.ne]: null,
        [Op.gt]: 4,
        [Op.lt]: 27,
      },
    },
    attributes: ['price', 'weight'],
    raw: true,
  });

  // Calculate price per kilo for each load
  let pricePerKiloValues = loadsData.map(entry =>
    Number((entry.price / (entry.weight * 1000)).toFixed(1))
  );

  // Handle case when no valid price per kilo values are available
  if (pricePerKiloValues.length === 0) {
    return {
      average: null,
      median: null,
      max: null,
      min: null,
      count: 0,
    };
  }

  // Sort the price per kilo values
  pricePerKiloValues.sort((a, b) => a - b);

  // Function to calculate quartiles
  const calculateQuartile = (data, quartile) => {
    const pos = (data.length - 1) * quartile;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (data[base + 1] !== undefined) {
      return data[base] + rest * (data[base + 1] - data[base]);
    } else {
      return data[base];
    }
  };

  // Calculate Q1, Q3, and IQR
  const Q1 = calculateQuartile(pricePerKiloValues, 0.25);
  const Q3 = calculateQuartile(pricePerKiloValues, 0.75);
  const IQR = Q3 - Q1;

  // Determine outlier thresholds
  const lowerBound = Q1 - 1.5 * IQR;
  const upperBound = Q3 + 1.5 * IQR;

  // Exclude outliers
  const filteredPrices = pricePerKiloValues.filter(
    pricePerKilo => pricePerKilo >= lowerBound && pricePerKilo <= upperBound
  );

  // Handle case when all data are outliers
  if (filteredPrices.length === 0) {
    return {
      average: null,
      median: null,
      max: null,
      min: null,
      count: 0,
    };
  }

  // Recalculate statistics without outliers
  const sum = filteredPrices.reduce((total, pricePerKilo) => total + pricePerKilo, 0);
  const average = sum / filteredPrices.length;

  const max = Math.max(...filteredPrices);
  const min = Math.min(...filteredPrices);

  // Calculate median
  const midIndex = Math.floor(filteredPrices.length / 2);
  let median;

  if (filteredPrices.length % 2 === 0) {
    median = (filteredPrices[midIndex - 1] + filteredPrices[midIndex]) / 2;
  } else {
    median = filteredPrices[midIndex];
  }

  // Return the calculated statistics and count
  return {
    average,
    median,
    max,
    min,
    count: filteredPrices.length,
  };
}

module.exports = { getPricePerKiloStatistics };

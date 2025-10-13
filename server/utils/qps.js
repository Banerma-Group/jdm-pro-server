const { Op, sequelize } = require('../../db/models');
const sequelizeqp = require('@bekzod/sequelizeqp');

const CUSTOM_HANDLER = {
  user: {
    customHandlers: {
      phone: phoneHandler, // prevents integer value error
    },
  },
};

function phoneHandler(column, phone, options) {
  let condition = { phone: { [Op.eq]: phone.toString() } };
  return condition;
}

function createDynamicRangeFilters(query) {
  const filters = {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value) && value.length === 2 && !isNaN(value[0]) && !isNaN(value[1])) {
      filters[key] = {
        [Op.between]: [parseInt(value[0]), parseInt(value[1])],
      };
    } else {
      // console.log(`Invalid range for ${key}: `, value); // Log any invalid ranges
    }
  }
  return filters;
}

function parse(config) {
  const modelName = config?.modelName;
  const strict = config?.strict || false;
  let { customHandlers } = CUSTOM_HANDLER[modelName] || {};

  const qps = new sequelizeqp({
    blacklist: ['createdAt'],
    customHandlers,
    options: { strict },
  });

  return function (qp, userId) {
    let query = { ...qp };

    delete query.ids;
    delete query.originOrDestination;
    delete query.cargoTypes;
    delete query.dateRange;

    query.limit = query.limit ? parseInt(query.limit, 10) : 10;
    query.page = query.page || 0;
    query.sort = query.sort || 'created_at';

    const dynamicFilters = createDynamicRangeFilters(qp);
    Object.assign(query, dynamicFilters);

    delete query.ids; // bug

    let cleanqps = qps.parse(query);

    cleanqps.include = [];
    cleanqps.distinct = true;

    if (qp.ids?.length) {
      cleanqps.where.id = { [Op.in]: qp.ids };
    }

    return cleanqps;
  };
}

module.exports = function (config) {
  return parse(config);
};

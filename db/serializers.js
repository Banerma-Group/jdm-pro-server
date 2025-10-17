const { Serializer, Deserializer, Error: JSONAPIError } = require('jsonapi-serializer');
const camelize = require('camelize');
const isEqual = require('lodash/isEqual');
const uniqWith = require('lodash/uniqWith');

const User = new Serializer('users', {
  attributes: [
    'firstName',
    'lastName',
    'email',
    'role',
    'media',
  ],
  media: { ref: 'id' },

  typeForAttribute: typeForAttribute,
  transform: relationTransform,
  meta: {
    pagination(records) {
      return records.pagination;
    },
  },
});

const Media = new Serializer('media', {
  attributes: ['url', 'name', 'user'],
  user: { ref: 'id' },
  typeForAttribute,
  transform: relationTransform,
  meta: {
    pagination(records) {
      return records.pagination;
    },
  },
});

const Vehicle = new Serializer('vehicles', {
  attributes: [
    'make',
    'model',
    'mileage',
    'color',
    'slug',
    'stockNumber',
    'status',
    'vin',
    'transmission',
    'youtubeLink',
    'description',
    'price',
    'isPosted',
    'year',
    'publishedAt',
    'locale',

    // munosabatlar (agar modelda bog‘langan bo‘lsa)
    'createdBy',
    'updatedBy',
  ],

  // Munosabatlar — faqat ID yuborish kerak bo‘lsa:
  youtubeCover: { ref: 'id' },
  createdBy: { ref: 'id' },
  updatedBy: { ref: 'id' },

  typeForAttribute,
  transform: relationTransform,
  meta: {
    pagination(records) {
      return records.pagination;
    },
  },
});

const PurchasingProcess = new Serializer('purchasing-processes', {
  attributes: [
    'title',
    'slug',
    'description',   // JSONB — to‘g‘ridan-to‘g‘ri ketadi
    'introduction',
    'publishedAt',
    'locale',

    // munosabatlar
    'createdBy',
    'updatedBy',
  ],

  createdBy: { ref: 'id' },
  updatedBy: { ref: 'id' },

  typeForAttribute,
  transform: relationTransform,
  meta: {
    pagination(records) {
      return records.pagination;
    },
  },
});

const Service = new Serializer('services', {
  attributes: [
    'title',
    'description', // JSONB
    'icon',
    'slug',
    'publishedAt',
    'locale',

    // munosabatlar
    'createdBy',
    'updatedBy',
  ],

  createdBy: { ref: 'id' },
  updatedBy: { ref: 'id' },

  typeForAttribute,
  transform: relationTransform,
  meta: {
    pagination(records) {
      return records.pagination;
    },
  },
});

const RELATION_NAME_TRANSLATION = {
  origin_city: 'city',
  originCity: 'city',
  origin_country: 'country',
  originCountry: 'country',
  destination_city: 'city',
  destinationCity: 'city',
  destination_country: 'country',
  destinationCountry: 'country',
  owner: 'user',
};

function relationTransform(record) {
  if (!record) {
    return null;
  }
  let json = record.toJSON ? record.toJSON() : record;

  let res = Object.keys(json).reduce((obj, key) => {
    let isIncluded = key in RELATION_NAME_TRANSLATION;
    let isRelation = key.includes('_id');
    let value = json[key];

    key = isRelation ? key.replace('_id', '') : key;
    if (value !== null) {
      if (isIncluded) {
        value = { id: value.id, type: RELATION_NAME_TRANSLATION[key] };
      } else {
        value = isRelation ? { id: value, type: RELATION_NAME_TRANSLATION[key] || key } : value;
      }
    }
    obj[camelize(key)] = value;
    return obj;
  }, {});

  return res;
}

function typeForAttribute(attribute, record) {
  return 'type' in record ? record.type : attribute;
}

const serializers = {
  User,
  Vehicle,
  Media,
  PurchasingProcess,
  Service,
};

const DefaultDeserializer = new Deserializer({
  keyForAttribute: 'camelCase',
});

function deserialize(models) {
  return DefaultDeserializer.deserialize(models);
}

function serialize(models, { type } = {}) {
  let isArray = Array.isArray(models);
  let model = isArray ? models[0] : models;
  let key = camelize(type || model?.constructor.name);
  let serializer = serializers[key];
  let json = serializer ? serializer.serialize(models) : { data: models };

  let nested = isArray
    ? models.map(getIncludes).reduce((sum, val) => sum.concat(...val), [])
    : getIncludes(model);

  let included = [];
  nested.forEach(val => {
    if (!val) {
      return;
    }
    let serialized = serialize(val);
    included.push(serialized.data);
    if (serialized.included) {
      included.push(...serialized.included);
    }
  });

  included = included.filter(({ type }) => type);

  if (included.length) {
    json.included = uniqWith(included, isEqual);
  }

  return json;
}

function getIncludes(model) {
  if (!model?._options) {
    return [];
  }
  let included = [];
  let { includeNames } = model._options;
  if (includeNames) {
    includeNames.forEach(function (name) {
      included = included.concat(model.get(name));
    });
  }

  return included;
}

module.exports = { ...serializers, serialize, deserialize, JSONAPIError };

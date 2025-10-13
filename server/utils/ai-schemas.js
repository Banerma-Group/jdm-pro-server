const CAR_TYPES_ENUM = [
  'none',
  'lexus',
  'isuzu',
  'chrysler',
  'chevrolet',
  'porsche',
  'bmw',
  'ford',
  'lamborghini',
  'tesla',
  'ferrari', // лабо
  'subaru', // чакман
  'mazda', // камаз
  'cadillac', // площадка
  'audi', // шаланда
  'toyota', // трал
  'volkswagen', // контейнеровоз
  'honda', // паровоз
  'mitsubishi', // газель
  'nissan', // sprinter
  'bentley', // avtovoz
  'suzuki', // изотерма
  'maserati', // изотерма
];

const LOAD_SCHEMA = Object.freeze({
  type: 'json_schema',
  strict: true,
  name: 'freight_info',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['messages'],
    properties: {
      messages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'phone', 'phones', 'loads'],
          properties: {
            id: {
              type: 'integer',
              description: 'id associated with text',
            },
            phone: {
              type: ['string', 'null'],
              description: 'single phone, only digits',
            },
            // New: multiple phones extracted, normalized
            phones: {
              type: 'array',
              description:
                'All phone numbers found in text. Digits only, order preserved, deduplicated. Do NOT infer or guess missing numbers.',
              items: {
                type: 'string',
                // pattern: '^(?:998\\d{9}|9[01345789]\\d{7}|7\\d{10}|8\\d{10}|9\\d{9})$',
                pattern:
                  '^(?:' +
                  '998\\d{9}' + // Uzbekistan with country code (998XXXXXXXXX)
                  '|(?:20|33|50|77|87|88|90|91|93|94|95|97|98|99)\\d{7}' + // Uzbekistan national prefixes
                  '|7\\d{10}' + // Russia/Kazakhstan with country code (+7XXXXXXXXXX)
                  '|8\\d{10}' + // Russia/Kazakhstan trunk form (8XXXXXXXXXX)
                  '|9\\d{9}' + // Russia 10-digit national (mobile)
                  '|380\\d{9}' + // Ukraine with country code (380XXXXXXXXX)
                  '|0\\d{9}' + // Ukraine national (0XXXXXXXXX)
                  '|90\\d{10}' + // Turkey (90XXXXXXXXXX)
                  '|995\\d{9}' + // Georgia (995XXXXXXXXX)
                  '|992\\d{9}' + // Tajikistan with country code
                  ')$',
              },
              minItems: 0,
            },
            loads: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'origin',
                  'destination',
                  'fare',
                  'fareCurrency',
                  'truckType',
                  'paymentType',
                  'hasPrepayment',
                  'prepaymentAmount',
                  'requiredVehicleCount',
                  'weight',
                  'volume',
                  'load',
                  'loadReadyDate',
                  'hasRefrigeratorMode',
                  'customsClearanceLocation',
                  'loadingSide',
                  'isLoadHazardous',
                  'pricingUnit',
                ],
                properties: {
                  fare: {
                    type: ['integer', 'null'],
                    description: 'cost of transportation',
                  },
                  fareCurrency: {
                    type: 'string',
                    enum: ['UZS', 'USD', 'RUB', 'EUR', 'KZT'],
                  },
                  pricingUnit: {
                    description: 'unit basis used to calculate the price for a load',
                    enum: ['kilo', 'ton', 'per_unit', 'km', 'flat'],
                  },
                  origin: {
                    type: ['string', 'null'],
                  },
                  destination: {
                    type: ['string', 'null'],
                  },
                  paymentType: {
                    type: 'string',
                    // description: 'cash (`нал, наличными`), transfer (`перевод, перечислением`)',
                    enum: ['none', 'cash', 'transfer', 'by_card', 'cash_or_by_card', 'combo'],
                  },
                  hasPrepayment: {
                    type: 'boolean',
                  },
                  prepaymentAmount: {
                    type: 'integer',
                  },
                  truckType: {
                    type: 'array',
                    description: 'vehicle brands occurring in text',
                    items: {
                      type: 'string',
                      enum: [...CAR_TYPES_ENUM],
                    },
                  },
                  requiredVehicleCount: {
                    type: 'integer',
                  },
                  weight: {
                    type: ['number', 'null'],
                    description: 'weight in tons, use only weight values from text',
                  },
                  volume: {
                    type: ['integer', 'null'],
                    description: 'cargo or truck volume in meter cube, куб',
                  },
                  load: {
                    type: ['string', 'null'],
                    description: 'Name of goods being transported cargo, freight',
                  },
                  loadReadyDate: {
                    type: ['string', 'null'],
                    description:
                      'only set if load date is specified, its little-endian format (DD.MM), if its range return in this format (DD.MM > DD.MM)',
                  },
                  hasRefrigeratorMode: {
                    type: 'boolean',
                    description: 'true if text contains `rejim` or `режим`',
                  },
                  loadingSide: {
                    type: 'string',
                    enum: ['none', 'боковая', 'задняя', 'верхняя'],
                  },
                  customsClearanceLocation: {
                    type: ['string', 'null'],
                  },
                  isLoadHazardous: {
                    type: 'boolean',
                    description: 'if word hazardous occurs',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

const DRIVER_SCHEMA = Object.freeze({
  type: 'json_schema',
  strict: true,
  name: 'driver_info',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['messages'],
    properties: {
      messages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'phone', 'vehicles'],
          properties: {
            vehicles: {
              type: 'array',
              items: {
                strict: true,
                type: 'object',
                additionalProperties: false,
                required: [
                  'origin',
                  'destinations',
                  'truckType',
                  'availbleVehicleCount',
                  'cargoWeight',
                  'cargoVolume',
                  'isLoadHazardous',
                ],
                properties: {
                  origin: {
                    type: 'string',
                    description: 'driver current location',
                  },
                  destinations: {
                    // description: 'preferred locations to be',
                    description:
                      'Only canonical place names (city/country/region/landmark). Exclude generic phrases; omit any item that isn’t a place.',
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                  },
                  truckType: {
                    description: 'vehicle brands occurring in text',
                    type: 'array',
                    items: {
                      // type: 'string',
                      enum: [...CAR_TYPES_ENUM],
                    },
                  },
                  availbleVehicleCount: {
                    type: 'integer',
                  },
                  cargoWeight: {
                    description: 'weight in tons, use only weight values from text',
                    type: ['number', 'null'],
                  },
                  cargoVolume: {
                    description: 'cargo or truck volume in meter cube, куб',
                    type: ['integer', 'null'],
                  },
                  isLoadHazardous: {
                    type: 'boolean',
                    description: 'if word hazardous occurs',
                  },
                },
              },
            },
            id: {
              type: 'integer',
              description: 'id associated with text',
            },
            phone: {
              description: 'single phone, only digits',
              type: ['string', 'null'],
            },
          },
        },
      },
    },
  },
});

function getLocationSchema() {
  return {
    type: 'json_schema',
    strict: true,
    name: 'location_info',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['locations'],
      properties: {
        locations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'name', 'city', 'state', 'country', 'street', 'other'],
            properties: {
              id: {
                type: 'string',
                description: 'The ID of the load.',
              },
              name: {
                type: 'string',
                description: 'full given text',
              },
              city: {
                type: 'string',
                description: 'city (or village) name, if applicable.',
              },
              state: {
                type: 'string',
                description: 'state (or district, region) name, if applicable.',
              },
              country: {
                type: 'string',
                description: 'country name, if applicable.',
              },
              street: {
                type: 'string',
                description: 'Street name and number, if applicable.',
              },
              other: {
                type: 'string',
                description: 'Any other location info not covered by the main fields.',
              },
            },
          },
        },
      },
    },
  };
}

function getSingleLocationSchema() {
  return {
    type: 'json_schema',
    strict: true,
    name: 'location_info',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['city', 'state', 'country', 'street', 'other', 'village', 'district'],
      properties: {
        city: {
          type: 'string',
          description: 'city name, if applicable.',
        },
        village: {
          type: 'string',
          description: `village name, if applicable.`,
        },
        state: {
          type: 'string',
          description: `state name, if applicable.`,
        },
        district: {
          type: 'string',
          description: `district or region name, if applicable.`,
        },
        country: {
          type: 'string',
          description: 'country name, if applicable.',
        },
        street: {
          type: 'string',
          description: 'Street name and number, if applicable.',
        },
        other: {
          type: 'string',
          description: 'Any other location info not covered by the main fields.',
        },
      },
    },
  };
}

module.exports = { LOAD_SCHEMA, DRIVER_SCHEMA, getLocationSchema, getSingleLocationSchema };

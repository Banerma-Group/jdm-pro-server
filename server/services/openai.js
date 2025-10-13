// require('dotenv').config();

const OpenAI = require('openai');
const crypto = require('crypto');
const dayjs = require('../utils/dayjs');
// const { Vehicle } = require('../../db/models');
const {
  LOAD_SCHEMA,
  DRIVER_SCHEMA,
  getLocationSchema,
  getSingleLocationSchema,
} = require('../utils/ai-schemas');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const openai = new OpenAI();
const debug = require('debug')('worker:telegram-crawl');
const aiDebug = require('debug')('worker:openai');

const s3Client = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

let permutations;
function getPermutations() {
  if (!permutations) {
    permutations = require('./permutations.json');
  }
  return permutations;
}

const forbiddenDestinationValues = [
  'isuzuga',
  'isuzuka',
  'isuzunga',
  'labo',
  'laboga',
  'laboka',
  'chakmanga',
  'chakmanka',
  'исузуга',
  'исузу',
  'лабога',
  'лабо',
  'чакманга',
  'чакман',
];

function cleanupDagruzKeywords(text) {
  return text.replace(
    /догруз|лахтак|папути|paputi|laxtak|ahchaga|qоshimchа|ахчага|дагрус|axchaga|кушимча юк|dogruz|poputi|қўшимча|dagruz|qoʻshimcha|quwimca|qoshimcha/gi,
    'hazardous'
  );
}

function cleanupTruckTrailerType(text) {
  const permutations = getPermutations();
  Object.entries(permutations).forEach(([key, values]) => {
    values.forEach(value => {
      // const regex = new RegExp(`(^|\\s|\\\\n|[0-9.,'"!?\\-:;\\/])${value}($|\\s|\\\\n|[0-9.,'"!?\\-:;\\/])`, 'gi');
      const regex = new RegExp(
        `(^|\\s|\\\\n|[0-9.,'"!?\\-:;\\/\\[\\]()])${value}($|\\s|\\\\n|[0-9.,'"!?\\-:;\\/\\[\\]()])`,
        'gi'
      );
      text = text.replace(regex, `$1${key}$2`);
    });
  });
  return text;
}

// function removeSpacesBetweenConsecutiveNumbers(text) {
//   // Regular expression to find sequences of 8 digits with spaces between them
//   const regex = /(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)/g;

//   // Replace matches with the sequence of numbers without spaces
//   return text.replace(regex, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
//     return p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8;
//   });
// }

function removeSpacesBetweenConsecutiveNumbers(str) {
  return str.replace(/(\d)\s+(?=\d)/g, (match, digit, offset) => {
    // Build a candidate by removing this space
    const candidate = str.slice(0, offset) + digit + str.slice(offset + match.length);

    // Count digits in the candidate run
    const digitsOnly = candidate.replace(/\D/g, '');
    if (digitsOnly.length > 12) {
      // Too many digits → keep the original match (don’t remove space)
      return match;
    }

    // Safe → collapse space
    return digit;
  });
}

async function parseLoadData(text) {
  text = removeSpacesBetweenConsecutiveNumbers(text);
  text = cleanupTruckTrailerType(text);
  text = cleanupDagruzKeywords(text);
  text = text.replace(/ (куба|cuba) /i, 'куб');
  text = text.replace(/\+(\d+)/g, '$1');
  // text = text.replace(
  //   /([\wа-яА-ЯёЁ]+(дан|dan))([\s.\n\]+|[\wа-яА-ЯёЁ]+)([\wа-яА-ЯёЁ]+(га|ga))/gim,
  //   '$1 -> $3$4'
  // );

  return openai.responses
    .parse({
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
      // temperature: 0,
      // top_p: 1,
      store: true,
      metadata: {
        type: 'load',
      },
      input: [
        {
          role: 'system',
          content:
            'given freight load info in YAML, convert it into the given structure. Do not translate the content. PROCESS EACH YAML "text" NODE SEPARATELY.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      text: { format: LOAD_SCHEMA },
    })
    .then(({ output_parsed, usage }) => {
      // debug(`load-parse-usage: ${JSON.stringify(usage)}`);
      return mergedData(output_parsed.messages).map(({ isInvalid, loads, phone, phones, id }) => {
        if (Array.isArray(phones) && phones.length > 0) {
          if (!phone) {
            phone = phones[0];
          } else {
            const phoneStr = String(phone);
            if (phoneStr.length > 15) {
              phone = phones[0];
            }
          }
        }

        loads = loads?.filter(Boolean);
        loads?.forEach(val => {
          val.phone = cleanupPhone(phone);
          val.phones = phones || [];
          val.price = validatePrice(val.fare, val.phone);
          val.currency = val.price > 1000000 ? 'UZS' : val.fareCurrency;
          val.price = val.prepaymentAmount === val.price ? null : val.price;

          if (val.price < 500 && val.currency === 'UZS') {
            val.pricingUnit = 'kilo';
          }

          if (val.price > 1000000 && val.pricingUnit == 'kilo') {
            val.pricingUnit = 'flat';
          }

          val.paymentType =
            val.paymentType === 'none'
              ? 'not_specified'
              : ['none', 'cash', 'transfer', 'by_card', 'cash_or_by_card', 'combo'].includes(
                    val.paymentType
                  )
                ? val.paymentType
                : null;

          if (val.loadReadyDate) {
            debug('Before date parsing:', val.loadReadyDate);
            let parsedDate = parseDate(val.loadReadyDate);
            const [loadReadyDateStart, loadReadyDateEnd] = parseDate(val.loadReadyDate) || [];
            val.loadReadyDate = loadReadyDateStart || null;
            val.loadReadyDateEnd = loadReadyDateEnd || null;
            debug('After date parsing:', val.loadReadyDate);
          }

          val.customsClearanceLocation =
            val.customsClearanceLocation === 'none' ? null : val.customsClearanceLocation;
          val.loadingSide = val.loadingSide === 'none' ? null : val.loadingSide;
          let typeFromLoad = translateCargo(val.load);

          val.hasRefrigeratorMode =
            val.hasRefrigeratorMode || (val.load && /(мясо|кури)/gi.test(val.load));

          val.cargoType = val.truckType
            ? translateCargo(val.truckType[0], val.hasRefrigeratorMode)
            : typeFromLoad;
          val.cargoType2 = val.truckType
            ? translateCargo(val.truckType[1], val.hasRefrigeratorMode)
            : typeFromLoad;
          val.requiredTrucksCount = val.requiredVehicleCount < 40 ? val.requiredVehicleCount : null;
          val.goods =
            val.load && val.load.length < 100 && typeFromLoad === 'not_specified'
              ? replaceAndTrim(val.load)
              : null;
          val.weight = val.weight < 80 && val.weight > 0 ? val.weight : null;
          val.volume =
            val.weight === 120 ? 120 : val.volume > 400 || val.volume < 30 ? null : val.volume;

          if (/dan$/.test(val.destination) || /дан$/.test(val.destination)) {
            let temp = val.destination;
            val.destination = val.origin;
            val.origin = temp;
          }

          if (val.destination) {
            const forbiddenSet = new Set(forbiddenDestinationValues);
            const cleaned = val.destination
              .split(/\s+/)
              .filter(tok => !forbiddenSet.has(tok.toLowerCase()))
              .join(' ')
              .trim();

            val.destination = cleaned || null;
          }

          // if ((!val.destination || val.destination === 'none') && val.origin) {
          //   const splitOrigin = val.origin.split(/[^a-zA-Z]+/);

          //   val.origin = splitOrigin[0];
          //   val.destination = splitOrigin[1] || '';
          // }

          // if (val.origin && val.destination) {
          //   let originIndex = text.indexOf(val.origin, text.indexOf(`id: ${id}`));
          //   let destinationIndex = text.indexOf(
          //     val.destination,
          //     originIndex - val.destination.length - 20
          //   );

          //   if (destinationIndex !== -1 && originIndex !== -1 && destinationIndex < originIndex) {
          //     debug(
          //       `destination before origin: ${text}, Origin: ${val.origin}, Destination: ${val.destination}`
          //     );
          //     // let orgin = val.origin
          //     // val.origin = val.destination;
          //     // val.destination = orgin;
          //   }
          // }

          val.isDagruz = val.weight
            ? val.weight < 1 || (val.isLoadHazardous && val.weight < 2)
            : val.isLoadHazardous;

          val.loadingSide = {
            боковая: 'side',
            задняя: 'rear',
            верхняя: 'top',
          }[val.loadingSide];

          delete val.isLoadHazardous;
          delete val.truckType;
          delete val.load;
          val.prepaymentAmount = validatePrepayment(val.price, val.prepaymentAmount);
          return val;
        });

        // loads = loads?.filter((val)=> {
        //   return val.originCity && val.destinationCity ? text.includes(val.originCity) && text.includes(val.destinationCity) : true
        // })

        if (!loads) {
          debug(`no loads found for text: ${text}`);
        }
        if (id === undefined) {
          debug(`id not found: ${text}`);
        }

        if (loads?.length > 3 && text?.length < 100) {
          debug(`too much loads: ${text} ${loads.map(val => JSON.stringify(val))}`);
        }
        return { isInvalid, loads, phone, id: id };
      });
    });

  function validatePrice(price, phone) {
    if (price < 10) {
      return null;
    }
    if (phone) {
      if (String(phone).includes(price) || phone === price) {
        return null;
      }
    }

    const priceStr = price.toString();

    if (price > 2147483647) {
      // check if it fits db
      return null;
    }

    if (price > 99999) {
      if (priceStr.endsWith('0000')) {
        return price;
      }
    } else if (price < 100000 && price >= 5000) {
      if (priceStr.endsWith('00') || priceStr.endsWith('50')) {
        return price;
      }
    } else if (price < 5000) {
      if (priceStr.endsWith('0')) {
        return price;
      }
    }

    return null;
  }

  function validatePrepayment(price, prepayment) {
    if (price > 1000000 && prepayment < 10000) {
      return null;
    }

    return prepayment > 0 ? prepayment : null;
  }

  function replaceAndTrim(text) {
    if (!text) return null;

    const brands = [
      'chevrolet',
      'porsche',
      'tesla',
      'chrysler',
      'bmw',
      'ford',
      'isuzu',
      'ferrari',
      'mazda',
      'lexus',
      'lamborghini',
      'audi',
      'toyota',
      'volkswagen',
      'honda',
      'cadillac',
      'subaru',
      'none',
      'mitsubishi',
      'nissan',
      'bentley',
      'suzuki',
      'maserati',
    ];
    brands.forEach(value => {
      const regex = new RegExp(`\\b${value}\\b`, 'gi');
      text = text.replace(regex, '');
    });

    return text
      .replace(/\s{2,}/g, ' ')
      .replace(/[!?:;]/g, '')
      .trim()
      .toLowerCase();
  }
}

async function parseDriverDetails(text) {
  text = removeSpacesBetweenConsecutiveNumbers(text);
  text = cleanupTruckTrailerType(text);
  text = cleanupDagruzKeywords(text);

  return openai.responses
    .parse({
      input: [
        {
          role: 'system',
          content:
            'given unstructured texts of Russian and Uzbek freight driver info in YAML, convert it into the given structure. Do not translate the content. PROCESS EACH "text" NODE SEPARATELY',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      // temperature: 0,
      // top_p: 1,
      // seed: 525212,
      store: true,
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
      metadata: {
        type: 'driver',
      },
      text: { format: DRIVER_SCHEMA },
    })
    .then(({ output_parsed, usage }) => {
      debug(`vehicle-parse-usage: ${JSON.stringify(usage)}`);
      return output_parsed.messages.map(({ vehicles, phone, id }) => {
        vehicles = vehicles?.filter(Boolean);
        vehicles?.forEach(val => {
          val.phone = cleanupPhone(val.phone);

          let tType = val.truckType?.[0];
          let tType2 = val.truckType?.[1];

          val.truckType = translateCargo(tType);
          val.truckType2 = translateCargo(tType2);
          val.weight = val.cargoWeight;
          val.volume = val.cargoVolume;

          delete val.cargoVolume;
          delete val.cargoWeight;

          val.isDagruz = val.isLoadHazardous || Boolean(val.weight && val.weight < 0.6);

          return val;
        });

        if (!vehicles) {
          debug(`no vehicles found for text: ${text}`);
        }

        if (id === undefined) {
          debug(`id not found: ${text}`);
        }

        if (vehicles?.length > 3 && text?.length < 100) {
          debug(`too much vehicles: ${text} ${vehicles.map(val => JSON.stringify(val))}`);
        }

        return { vehicles, phone, id: id };
      });
    });
}

function mergedData(data) {
  return Object.values(
    data.reduce((acc, obj) => {
      const { id, loads, ...otherProps } = obj;

      if (!acc[id]) {
        acc[id] = { id, loads: [], ...otherProps };
      }

      // Merge loads
      acc[id].loads = acc[id].loads.concat(loads);

      // If any other properties need special merging, handle them here.
      // For example, if you want to ensure other properties are consistent across objects with the same id,
      // you might need additional logic here.

      return acc;
    }, {})
  );
}

function parseDate(dateString) {
  if (!dateString) return null;

  const currentDate = dayjs();
  const currentYear = currentDate.year();

  const normalize = str => str.trim().replace(/[.\-\s]/g, '/'); // now handles "-", ".", space

  const isValidAndInRange = d => d.isValid() && Math.abs(d.diff(currentDate, 'day')) <= 16;

  const tryParse = str => {
    const hasFullYear = /\d{4}/.test(str);
    const hasShortYear = /^\d{2}\/\d{2}\/\d{2}$/.test(str);

    const formats = ['DD/MM', 'D/M', 'DD/MM/YYYY', 'D/M/YYYY', 'DD/MM/YY', 'D/M/YY'];

    let date = dayjs(str, formats, true);
    if (!hasFullYear && !hasShortYear) {
      date = date.year(currentYear); // Inject current year only if missing
    }

    if (isValidAndInRange(date)) return date;

    // Try flipping
    const parts = str.split('/');
    if (parts.length >= 2) {
      const [part1, part2, part3] = parts;
      const flipped = [part2, part1, part3].filter(Boolean).join('/');
      let flippedDate = dayjs(flipped, formats, true);
      if (!hasFullYear && !hasShortYear) {
        flippedDate = flippedDate.year(currentYear);
      }
      if (isValidAndInRange(flippedDate)) return flippedDate;
    }

    return null;
  };

  if (dateString.includes('>')) {
    const [startRaw, endRaw] = dateString.split('>').map(normalize);
    const start = tryParse(startRaw);
    const end = tryParse(endRaw);
    const result = [];
    if (start) result.push(start.format('YYYY-MM-DD'));
    if (end) result.push(end.format('YYYY-MM-DD'));
    return result.length ? result : null;
  } else {
    const single = tryParse(normalize(dateString));
    return single ? [single.format('YYYY-MM-DD')] : null;
  }
}

const VEHICLE_BRAND_MAP = {
  none: 'not_specified',
  isuzu: 'isuzu',
  ford: 'small_isuzu',
  bmw: 'big_isuzu',
  lexus: 'man',
  ferrari: 'labo',
  subaru: 'chakman',
  mazda: 'kamaz',
  cadillac: 'flatbed',
  audi: 'barge',
  toyota: 'lowboy',
  tesla: 'faw',
  chevrolet: 'tented',
  volkswagen: 'containership',
  honda: 'locomotive',
  chrysler: 'mega',
  porsche: 'reefer',
  lamborghini: 'reefer-mode',
  mitsubishi: 'gazel',
  nissan: 'sprinter',
  bentley: 'avtovoz',
  suzuki: 'isotherm',
  maserati: 'kia_bongo',
};

function translateCargo(key, hasMode) {
  if (!key) return 'not_specified';
  const type = VEHICLE_BRAND_MAP[key?.toLowerCase().trim()] || 'not_specified';

  return type === 'reefer' && hasMode ? 'reefer-mode' : type;
}

function cleanupPhone(phone) {
  return phone?.length > 8 ? phone.replace(/\D/g, '') : null;
}

function cleanLocationField(value) {
  if (!value) return '';

  const stopWords = [
    'область',
    'обл',
    'край',
    'улица',
    'республика',
    'респ',
    'район',
    'р-н',
    'округ',
    'город',
    // 'г',
    'посёлок',
    'поселок',
    'пос',
    'село',
    'деревня',
    'ст-ца',
    'станица',

    // Uzbek — Latin
    'viloyati',
    'viloyat',
    'tumani',
    'tuman',
    'shahri',
    'shahar',
    // 'sh',
    'mfyi', // sh. (abbr)
    'respublikasi',
    'respublika',
    "qishlog\\'i",
    'qishlogi',
    'qishloq',
    'qfq', // qishlog'i
    'toshkentshahar', // sometimes written merged
    'ko`chasi',
    'shaxar',

    // Uzbek — Cyrillic
    'вилояти',
    'вилоят',
    'тумани',
    'туман',
    'шаҳри',
    'шахри',
    'шаҳар',
    'шахар',
    // 'ш',
    'республикаси',
    'республика',
    'қишлоғи',
    'қишлоқ',
  ];

  const originalWords = value.split(/\s|,|\./).filter(Boolean);
  const cleanedWords = [];

  for (let w of originalWords) {
    if (!stopWords.includes(w.toLowerCase())) {
      cleanedWords.push(w);
    }
  }

  return cleanedWords.join(' ');
}

async function generateCityNames(text) {
  const prompt = `
    Given the city name generate a JSON object with the following fields:
    - nameUz: the Uzbek (Latin) name
    - nameRu: the Russian name (Cyrillic)
    - nameEn: the English transliteration
    - names: a comma-separated string of possible variants including misspellings or phonetic alternatives (including Cyrillic variants), lowercase, no spaces after comma, no duplicates
  `;

  return openai.responses
    .parse({
      model: 'gpt-5-nano',
      reasoning: { effort: 'minimal' },
      // temperature: 0,
      // top_p: 1,
      store: true,
      metadata: {
        type: 'load',
      },
      input: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          name: 'freight_info',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['nameUz', 'nameRu', 'nameEn', 'names'],
            properties: {
              nameUz: { type: 'string' },
              nameRu: { type: 'string' },
              nameEn: { type: 'string' },
              names: {
                type: 'string',
                description: 'Comma-separated name variants',
              },
            },
          },
        },
      },
    })
    .then(({ output_parsed, usage }) => {
      aiDebug(`generate-names-usage: ${JSON.stringify(usage)}`);
      output_parsed.names = Array.from(
        new Set(
          [...output_parsed.names.split(','), text.toLowerCase()].map(name =>
            name.trim().includes(' ') ? name.trim().replace(/\s+/g, '-') : name.trim()
          )
        )
      ).join(',');
      return output_parsed;
    });
}

async function parseLocationDetails(text) {
  return openai.responses
    .parse({
      model: 'gpt-5-nano',
      reasoning: { effort: 'minimal' },
      // temperature: 0,
      // top_p: 1,
      store: true,
      metadata: {
        type: 'location-details',
      },
      input: [
        {
          role: 'system',
          content:
            'you are a geographic location parser, given locations are in Russian and Uzbek languages in YAML format, convert it into the given structure. PROCESS EACH YAML "name" NODE SEPARATELY.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      text: { format: getLocationSchema() },
    })
    .then(({ output_parsed, usage }) => {
      debug(`parse-locations-usage: ${JSON.stringify(usage)}`);
      return output_parsed.locations;
    });
}

async function parseSingleLocationDetails(text) {
  return openai.responses
    .parse({
      model: 'gpt-5-nano',
      reasoning: { effort: 'minimal' },
      // temperature: 0,
      // top_p: 1,
      store: true,
      metadata: {
        type: 'single-location-details',
      },
      input: [
        {
          role: 'system',
          content:
            // 'You are a location parser for Uzbek or Russian text, parse it into the given structure and extract only what is explicitly mentioned in text. Leave country field empty if no matching info provided in text.',
            'You are a location parser for Uzbek/Russian text. Do NOT infer or fill in any country unless it appears in the text.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      text: { format: getSingleLocationSchema() },
    })
    .then(({ output_parsed, usage }) => {
      debug(`parse-location-usage: ${JSON.stringify(usage)}`);

      // Clean unwanted words from the parsed location fields
      if (output_parsed) {
        output_parsed.city = cleanLocationField(output_parsed.city);
        output_parsed.village = cleanLocationField(output_parsed.village);
        output_parsed.state = cleanLocationField(output_parsed.state);
        output_parsed.country = cleanLocationField(output_parsed.country);
        output_parsed.street = cleanLocationField(output_parsed.street);
        output_parsed.district = cleanLocationField(output_parsed.district);
        output_parsed.other = cleanLocationField(output_parsed.other);
      }

      return output_parsed;
    });
}

const uploadImage = async (buffer, contentType) => {
  const fileKey = `yukon-uz/post-images/${crypto.randomUUID()}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${fileKey}`;
};

const generateImage = async prompt => {
  const imageRes = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    quality: 'medium',
    n: 1,
  });

  // `gpt-image-1` can return base64 instead of a URL, so we handle that
  const imageBase64 = imageRes.data[0].b64_json;
  const imageBuffer = Buffer.from(imageBase64, 'base64');

  // Upload to your S3 (or other storage)
  const s3ImageUrl = await uploadImage(imageBuffer, 'image/png');
  return s3ImageUrl;
};

module.exports = {
  parseLoadData,
  parseDriverDetails,
  generateCityNames,
  parseLocationDetails,
  parseSingleLocationDetails,
  generateImage,
};

// parseLoadData(
//   `- id: 0
//   text: |-
// Псковская область, д. Заплюсье - Кибрай
// Груз: торф
// Вес до 21тонн
//  реф без режима или тент
// 77 280 01 159`
// ).then(console.log);

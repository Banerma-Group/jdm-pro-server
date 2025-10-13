const { generateImage } = require('../services/openai');
const redisClient = require('../services/redis');
const { captions } = require('./captions');

function calcGrowth(current, previous) {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function areArraysEqual(arr1, arr2) {
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) return arr1 === arr2; // Handle cases where one is not an array
  if (arr1.length !== arr2.length) return false;
  return arr1.every((value, index) => value === arr2[index]);
}

function randomImagePromt() {
  const categories = {
    subjects: [
      'trucks',
      'single truck',
      'long-haul semi-truck',
      'fleet of box trucks',
      'container ship with trucks',
      'delivery drone with a truck',
    ],
    actions: [
      'loading pallets',
      'GPS route recalculating',
      'cold-chain delivery',
      'reverse logistics pickup',
      'ride',
    ],
    environments: [
      'desert sunrise highway',
      'snowy mountain pass',
      'busy port with cranes',
      'suburban golden hour',
      'warehouse interior',
      'landscapes',
      'highway',
      'urban background',
    ],
    // overlays: [
    //   'holographic dotted path',
    //   '3D map grid with glowing nodes',
    //   'dashed line between pins',
    //   'AR HUD with ETA',
    //   'digital particles flowing on the road',
    //   'none',
    // ],
    compositions: [
      'isometric wide-angle',
      'low-angle hero shot',
      'top-down logistics map',
      'rule-of-thirds framing',
      'cinematic panorama',
      'random',
    ],
    palettes: [
      'cool blues & teals',
      'warm sunset oranges',
      'black & white high contrast',
      'bright color',
      'retro 80s teal & magenta',
      'realistic colors',
    ],
    illustration: [
      'flat vector illustration',
      '3D soft render',
      'watercolor with ink outlines',
      'low-poly art',
      'isometric infographic',
    ],
    realistic: [
      'photorealistic cinematic lighting',
      'HDR detailed realism',
      'documentary photography',
    ],
  };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const styleBucket = pick(['realistic', 'illustration']);
  let styleText = pick(categories[styleBucket]);

  // removed "Route overlay: ${pick(categories.overlays)}." from result

  return `A creative concept illustration representing modern logistics and cargo delivery: ${pick(categories.subjects)} ${pick(categories.actions)}.
Setting: ${pick(categories.environments)}.
Composition: ${pick(categories.compositions)}.
Palette: ${pick(categories.palettes)}.
Art style: ${styleText}.
Creative, dynamic, and distinct framing.`;
}

const generateContent = async () => {
  try {
    const imgUrl = await generateImage(randomImagePromt());
    // const caption = await generateCaption(CAPTION_INSTRUCTION);

    const randomCaptionIndex = Math.floor(Math.random() * captions.length);
    const caption = captions[randomCaptionIndex];

    console.log('Generated new content at:', new Date().toISOString());
    return {
      imgUrl,
      caption,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('generateContent:', error);
    return {
      imgUrl: null,
      caption: null,
      timestamp: 0,
    };
  }
};

async function enforceWaitTimer(userId, recordId, keyName) {
  const TTL_SECONDS = 30;
  const k = `${keyName}-phone-view:${userId}-${recordId}`;

  const result = await redisClient.set(k, '1', 'EX', TTL_SECONDS, 'NX');

  if (result === 'OK') {
    // Key was created with TTL -> first call is allowed
    return { allowed: true, retryIn: 0 };
  }

  // Key exists -> compute remaining TTL
  // Use PTTL for better precision; fall back sensibly
  let pttl = await redisClient.pttl(k); // ms; -2 no key, -1 no expire
  if (pttl < 0) pttl = TTL_SECONDS * 1000; // shouldn't happen, but safe default
  const retryIn = Math.ceil(pttl / 1000);
  return { allowed: false, retryIn };
}

function wait(ms = 5500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  wait,
  calcGrowth,
  areArraysEqual,
  generateContent,
  enforceWaitTimer,
};

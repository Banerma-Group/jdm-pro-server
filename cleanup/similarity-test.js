require('dotenv').config();

const { findSimilarCityName } = require('../server/utils/general');

async function main() {
  const text = 'kant';

  // const res = await find(text, false);
  const res = await findSimilarCityName(text);
  console.log(res);
}

main();

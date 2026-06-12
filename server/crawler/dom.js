const { parseHTML } = require('linkedom');

function parseHtml(html) {
  return parseHTML(html).document;
}

module.exports = {
  parseHtml,
};

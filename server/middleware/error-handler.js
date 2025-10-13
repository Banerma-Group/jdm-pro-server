const util = require('util');
const logger = require('../utils/logger');
const isProduction = process.env.NODE_ENV === 'production';

function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error: ${err}`);
  if (req.path.startsWith('/api') && isProduction) {
    const errMessages = [
      '[!] API ERROR:',
      util.format('    %s %s', req.method, req.originalUrl),
      'Headers: ',
    ];

    Object.keys(req.headers).forEach(headerKey => {
      const headerVal = req.headers[headerKey];
      errMessages.push(util.format('    %s: %s', headerKey, headerVal));
    });
    errMessages.push(util.format(err));
    logger.error(errMessages.join('\n'));
  } else {
    logger.error(err);
  }

  if (isProduction) {
    res.sendStatus(500);
  } else {
    res.status(500).send({ error: util.format(err) });
  }
}

process.on('unhandledRejection', function (reason, promise) {
  logger.error(`${reason} ${promise}`);
});

module.exports = errorHandler;

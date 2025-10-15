require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const compression = require('compression');
const zlib = require('zlib');
const i18n = require('./server/services/i18n-config');
const errorHandler = require('./server/middleware/error-handler');
// const bot = require('./server/bot-app/index');

const isTest = process.env.NODE_ENV === 'test';

morgan.format('custom', ':method :url :status :res[content-length] - :response-time ms');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://jdm-pro-dashboard.vercel.app',
  'https://jdm-pro-server.onrender.com'
];

const corsOptions = function (req, callback) {
  let options = {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: true,
    allowedHeaders: [
      'X-Requested-With',
      'X-HTTP-Method-Override',
      'Content-Type',
      'Accept',
      'Cookie',
      'Authorization',
      'user-locale',
      'X-Device-Id',
      'Idempotency-Key',
      'X-Device-Model',
      'X-Device-Platform',
      'X-Device-UA',
      'Referer'
    ],
  };

  const requestOrigin = req.header('Origin');
  const isAllowedOrigin = allowedOrigins.some(origin => {
    if (requestOrigin === origin) return true;
    const originWithoutProtocol = origin.replace(/^https?:\/\//, '');
    if (requestOrigin?.includes('.' + originWithoutProtocol)) return true;
    return false;
  });

  options.origin = isAllowedOrigin;
  callback(null, options);
};

const app = express();

// App settings
app.set('x-powered-by', false);
app.set('view cache', false);
app.set('query parser', 'extended');
app.set('trust proxy', true);

// Middleware
if (!isTest) {
  app.use(morgan('custom'));
}

app.use(
  compression({
    threshold: 1024, // compress responses over 1kb
    brotli: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, // enable Brotli with moderate quality
  })
);

app.use(cookieParser());
app.use(i18n.init);
app.use(cors(corsOptions));

// Body parsers (no need for body-parser package)
app.use(express.urlencoded({ extended: false }));
app.use(
  express.json({
    strict: true,
    limit: '200kb',
    type: '*/*',
  })
);

// // Bot webhook
// app.use(bot.webhookCallback('/api/webhook_telegram'));

// Bot webhook (prod only)
if (process.env.NODE_ENV === 'production') {
  // app.use(bot.webhookCallback('/api/webhook_telegram'));
}

// Routes
app.use(require('./server/routes'));

// Health check
app.get('/health', async (req, res) => {
  // const webhookInfo = await bot.telegram.getWebhookInfo();
  // if (webhookInfo.url === 'https://logistics-backend-uufl.onrender.com/api/webhook_telegram') {
    res.status(200).send('Server are ready to receive traffic');
  // } else {
  //   res.status(503).send('Webhook is not ready or there are pending updates');
  // }
});

// Global error handler
app.use(errorHandler);

module.exports = app;

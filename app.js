const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const i18n = require('./server/services/i18n-config');
const errorHandler = require('./server/middleware/error-handler');

const isTest = process.env.NODE_ENV === 'test';

morgan.format('custom', ':method :url :status :res[content-length] - :response-time ms');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://jdm-pro-dashboard.vercel.app',
  'https://jdm-pro-dashboard.vercel.app/',
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
      'Sec-Ch-Ua',
      'Sec-Ch-Ua-Mobile',
      'Sec-Ch-Ua-Platform',
      'User-Agent',
      'user-locale',
      'Idempotency-Key',
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
app.use(helmet());
if (!isTest) {
  app.use(morgan('custom'));
}

app.use(cookieParser());
app.use(i18n.init);

// Body parsers (no need for body-parser package)
app.use(express.urlencoded({ extended: false }));
app.use(
  express.json({
    strict: true,
    limit: '200kb',
    type: '*/*',
  })
);

// CORS
app.use(cors(corsOptions));

// Routes
app.use(require('./server/routes'));

// Global error handler
app.use(errorHandler);

// Health check
app.get('/health', async (req, res) => {
  res.status(200).send('Bot and webhook are ready to receive traffic');
});

module.exports = app;

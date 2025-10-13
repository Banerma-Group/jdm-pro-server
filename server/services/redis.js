require('dotenv').config();

const Redis = require('ioredis');
const logger = require('../utils/logger');

let client = new Redis(process.env.REDIS_URL);

client.on('connect', () => {
  const address = `${client.options.host}:${client.options.port}`;
  logger.info(`Connected to Redis at: ${address}`);
});

client.on('error', err => {
  logger.error(`Redis error: ${err}`);
});

client.on('close', () => {
  logger.warn('Redis connection closed.');
});

client.on('reconnecting', time => {
  logger.warn(`Redis reconnecting in ${time}ms`);
});

module.exports = client;

require('dotenv').config();

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const redisClient = require('./redis');
const { DAY } = require('time-constants');
const input = require('input');

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;

const telegramClient = (session = '') => {
  const stringSession = new StringSession(session);
  return new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: Infinity,
    autoReconnect: true,
    retryDelay: 5000,
  });
};

const sendAuthCode = async (client, phone) => {
  await client.connect();
  const { phoneCodeHash } = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
  const key = `telegram-sign-in:${phone}`;
  await redisClient.set(key, phoneCodeHash, 'EX', DAY / 1000);
  return client;
};

const authWithCode = async (client, phone, code) => {
  await client.connect();
  const key = `telegram-sign-in:${phone}`;
  const phoneCodeHash = await redisClient.get(key);
  const { user } = await client.invoke(
    new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })
  );
  return { sessionToken: client.session.save(), user };
};

// sendAuthCode(telegramClient(), '6283847247763').then(async (client) => {
//   const code = await input.text('telegram code');
//   const res = await authWithCode(client, '6283847247763', code);
//   console.log('Session Token:', res.sessionToken);
// });

module.exports = { telegramClient, sendAuthCode, authWithCode, Api };

const redisClient = require('./redis');
const axios = require('axios');
const FormData = require('form-data');
const { MINUTE, DAY } = require('time-constants');
const isTest = process.env.NODE_ENV === 'test';
const { v4: uuidv4 } = require('uuid');
const { normalizePhone } = require('../utils/phone');

function getMessage(name, data, locale = 'uz') {
  const messages = {
    'customer-invited': {
      en: `You have been invited to ${data?.company?.name}, please follow this link to join ${data.link}`,
      ru: `Вы были приглашены в ${data?.company?.name}, пожалуйста, перейдите по этой ссылке, чтобы присоединиться ${data.link}`,
      uz: `Siz ${data?.company?.name}ga taklif qilindingiz, qo'shilish uchun ushbu havolaga o'ting ${data.link}`,
    },
    'reset-password': {
      en: `Your confirmation code ${data.token} for reset password`,
      ru: `Код подтверждения для сброса пароля на сайте Yukon.uz: ${data.token}`,
      uz: `Yukon.uz saytida parolni tiklash uchun tasdiqlash kodi: ${data.token}`,
    },
    register: {
      en: `Your confirmation code ${data.token} for registering`,
      ru: `Код подтверждения для регистрации на сайте Yukon.uz: ${data.token}`,
      uz: `Yukon.uz saytida roʻyxatdan oʻtish uchun tasdiqlash kodi: ${data.token}`,
    },
  };

  // Update invite message if the user is not registered
  if (name === 'customer-invited' && !data.user.isRegistered) {
    const registerLink = `${process.env.FRONT_HOST_NAME}/confirm/${data.token}&${data.user.phone}`;
    Object.keys(messages['customer-invited']).forEach(lang => {
      messages['customer-invited'][lang] =
        `You have been invited to ${data.company.name}, please follow this link to register ${registerLink}`;
    });
  }

  return messages[name][locale] || messages[name]['uz']; // Fallback to English if locale not found
}

async function getSMSProviderToken() {
  const KEY = redisKey('provider-token');
  let token = await redisClient.get(KEY);

  if (token) {
    return token;
  }

  let form = new FormData();
  form.append('email', process.env.ESKIZ_UZ_EMAIL);
  form.append('password', process.env.ESKIZ_UZ_PASSWORD);

  let { data } = await axios({
    method: 'post',
    url: 'https://notify.eskiz.uz/api/auth/login',
    headers: {
      ...form.getHeaders(),
    },
    data: form,
  });

  token = data.data?.token;
  if (token) {
    await redisClient.set(KEY, token, 'EX', (DAY * 30) / 1000);
  }

  return token;
}

async function sendMessage(phone, body) {
  if (isTest) {
    return;
  }

  let token = await getSMSProviderToken();

  let form = new FormData();
  form.append('mobile_phone', phone);
  form.append('message', body);
  form.append('from', '4546');
  // form.append('callback_url', 'http://0000.uz/test.php');
  try {
    let { data } = await axios({
      method: 'post',
      url: 'https://notify.eskiz.uz/api/message/sms/send',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      data: form,
    });

    return data;
  } catch (e) {
    console.log(e);
    return 0;
  }
}

async function sendText(phone, templateName, data) {
  const allowed = await checkForFlood(phone);
  if (!allowed) {
    return -1;
  }
  await sendMessage(phone, getMessage(templateName, data));

  return 1;
}

function redisKey() {
  return `sms:token:` + [...arguments].join(':');
}

async function checkForFlood(phone) {
  const key = `${redisKey(phone)}:sms-count`;
  const val = await redisClient.get(key);
  const count = (val ? parseInt(val, 10) : 0) + 1;
  if (count >= 10) {
    return false;
  }
  await redisClient.set(key, count, 'EX', (MINUTE * 5) / 1000);
  return true;
}

async function sendToken(
  phone,
  action,
  token = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
) {
  if (!phone || !['reset-password', 'register'].includes(action)) {
    return 0;
  }
  const allowed = await checkForFlood(phone);
  if (!allowed) {
    return -1;
  }
  let result = await sendMessage(phone, getMessage(action, { token }));
  await redisClient.set(redisKey(phone, action), token, 'EX', (MINUTE * 2) / 1000);

  return result === 0 ? 0 : 1;
}

async function confirmToken(phone, token, action, destroy = false) {
  if (!token || !phone || !action) {
    return false;
  }

  phone = normalizePhone(phone);

  let redisToken = await redisClient.get(redisKey(phone, action));

  if (destroy) {
    await destroyToken(phone, action);
  }

  return redisToken === token;
}

async function destroyToken(phone, action) {
  if (!phone) {
    return;
  }
  return await redisClient.del(redisKey(phone, action));
}

async function sendInvite(phone, action, data) {
  if (!phone) return 0;

  const allowed = await checkForFlood(phone);
  if (!allowed) return -1;

  let token = uuidv4();

  sendText(phone, action, { ...data, token });
  await redisClient.set(redisKey(phone, action), token, 'EX', DAY / 1000);

  return 1;
}

module.exports = {
  sendInvite,
  sendText,
  sendToken,
  checkForFlood,
  confirmToken,
  redisKey,
  destroyToken,
  sendMessage,
};

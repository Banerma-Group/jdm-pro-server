const jwt = require('jsonwebtoken');
const { WEEK } = require('time-constants');
const crypto = require('crypto');

function getAuthToken(userId) {
  const expiresIn = WEEK;
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn,
  });

  return { token, userId, expires: new Date(Date.now() + expiresIn) };
}

function verifyTelegramAuth(data, botToken) {
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const { hash, ...authData } = data;

  const checkString = Object.keys(authData)
    .sort()
    .map(key => `${key}=${authData[key]}`)
    .join('\n');

  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return hmac === hash;
}

async function verifyToken(req) {
  const token = req.headers.authorization || req.query.auth;
  if (!token) {
    return null;
  }
  try {
    const payload = await jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getAuthToken,
  verifyToken,
  verifyTelegramAuth,
};

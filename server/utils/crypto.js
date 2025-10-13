const crypto = require('crypto');
const Promise = require('bluebird');
const pbkdf2Async = Promise.promisify(crypto.pbkdf2);
const randomBytes = Promise.promisify(crypto.randomBytes);

const algorithm = 'aes-256-ctr';

function encrypt(text, password) {
  let cipher = crypto.createCipher(algorithm, password);
  let crypted = cipher.update(text, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text, password) {
  let decipher = crypto.createDecipher(algorithm, password);
  let dec = decipher.update(text, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

module.exports = {
  getHash(pass, salt, itiration, length) {
    return pbkdf2Async(pass, salt, itiration || 60000, length || 512, 'sha512').call(
      'toString',
      'hex'
    );
  },

  encrypt,
  decrypt,

  async randomSalt(count = 128, encoding = 'hex') {
    let bytes = await randomBytes(count);
    return bytes.toString(encoding);
  },
};

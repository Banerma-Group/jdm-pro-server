import crypto from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(crypto.pbkdf2);
const randomBytesAsync = promisify(crypto.randomBytes);

export async function getHash(pass, salt, iteration, length) {
  const buf = await pbkdf2Async(pass, salt, iteration || 60000, length || 512, "sha512");
  return buf.toString("hex");
}

export async function randomSalt(count = 128, encoding = "hex") {
  const bytes = await randomBytesAsync(count);
  return bytes.toString(encoding);
}

// Verify a user's password against the stored salt/hash (mirrors the old
// User.matchPassword: getHash(password, salt) === hash).
export async function matchPassword(password, salt, hash) {
  if (!salt) return false;
  const computed = await getHash(password, salt);
  return computed === hash;
}

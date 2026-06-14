import crypto from "crypto";
import { getRedis } from "./redis.js";

const TTL_SECONDS = 600; // 10 minutes to press Start
const keyFor = (token) => `tg:connect:${token}`;

// Dashboard asks for a token, opens t.me/<bot>?start=<token>, then polls status.
export async function createConnectToken() {
  const token = crypto.randomBytes(16).toString("hex");
  await getRedis().set(keyFor(token), JSON.stringify({ status: "pending" }), "EX", TTL_SECONDS);
  return token;
}

export async function getConnectToken(token) {
  const raw = await getRedis().get(keyFor(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Called by the bot once the user presses Start with a valid payload.
export async function resolveConnectToken(token, payload) {
  const existing = await getConnectToken(token);
  if (!existing) return false;
  await getRedis().set(keyFor(token), JSON.stringify({ status: "connected", ...payload }), "EX", TTL_SECONDS);
  return true;
}

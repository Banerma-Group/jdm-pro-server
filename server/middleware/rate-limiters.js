// limiter.js

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // ⬅️ add this
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../services/redis');
const logger = require('../utils/logger');

function buildLimiter(max, windowMs = 1 * 60 * 1000, message = 'Too many requests') {
  try {
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message,
      // Optional: if you want to silence validations after the first request, you can omit this.
      // validate: { /* leave defaults */ },

      store: new RedisStore({
        // sendCommand: (command, ...args) => redisClient.send_command(command, ...args),
        sendCommand: (...args) => redisClient.call(...args),
      }),

      keyGenerator: (req, res) => {
        // Prefer stable, non-IP identifiers when available:
        if (req.user?.id) return `user-${req.user.id}`;

        if (req.headers?.authorization) {
          // Avoid storing raw tokens in Redis keys (privacy); hash or truncate if you prefer.
          return `auth-${Buffer.from(req.headers.authorization).toString('base64url')}`;
        }

        // Fallback to normalized IP (handles IPv6 correctly)
        // Option A (simple): let the helper choose a reasonable default
        return `ip-${ipKeyGenerator(req.ip)}`;

        // Option B (explicit /64 IPv6 subnet):
        // const IPV6_SUBNET = 64;
        // return `ip-${ipKeyGenerator(req.ip, IPV6_SUBNET)}`;
      },
    });
  } catch (err) {
    logger.error(`Failed to create rate limiter: ${err}`);
    throw err;
  }
}

function smartRateLimit({ authMax = 200, anonMax = 50, windowMs = 1 * 60 * 1000 } = {}) {
  const authLimiter = buildLimiter(authMax, windowMs, 'Too many requests (logged in)');
  const anonLimiter = buildLimiter(anonMax, windowMs, 'Too many requests (anonymous)');

  return (req, res, next) => {
    try {
      const isAuthenticated = !!req.user;
      const limiter = isAuthenticated ? authLimiter : anonLimiter;
      limiter(req, res, next);
    } catch (err) {
      logger.error(`[RateLimit Error] ${err}`);
      next(err);
    }
  };
}

module.exports = { smartRateLimit };

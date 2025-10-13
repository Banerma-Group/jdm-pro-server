const express = require('express');
const router = express.Router();
const auth = require('../middleware/jwt-auth');
const { v4: uuidv4 } = require('uuid');
const { WEEK } = require('time-constants');
const deviceGuard = require('../middleware/device-guard');

// JWT autentifikatsiya middleware
router.use(auth);

// Locale va session-id middleware
router.use((req, res, next) => {
  req.locale = req.headers['user-locale'] || 'uz';

  const sessionId = req.cookies['session-id'] || uuidv4();
  res.cookie('session-id', sessionId, {
    maxAge: WEEK,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  req.sessionId = sessionId;

  next();
});

// Public auth routes first (no device guard here)
router.use('/api/auth', require('./api/auth'));

// // Everything below here requires same-device check
router.use('/api', deviceGuard(), require('./api'));

module.exports = router;

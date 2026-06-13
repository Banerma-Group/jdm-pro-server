const express = require('express');
const router = express.Router();
const { smartRateLimit } = require('../../middleware/rate-limiters');

router.use('/search', smartRateLimit({ authMax: 300, anonMax: 30 }), require('./search'));
router.use('/vehicles', smartRateLimit({ authMax: 150, anonMax: 15 }), require('./vehicles'));
router.use('/crawler/telegram', smartRateLimit({ authMax: 300, anonMax: 30 }), require('./crawler-telegram'));
router.use('/crawler', smartRateLimit({ authMax: 300, anonMax: 30 }), require('./crawler'));

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/purchasing-processes', require('./purchasing-processes'));
router.use('/services', require('./services'));
router.use('/media', require('./media'));

module.exports = router;

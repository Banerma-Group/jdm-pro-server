const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../../../db/models');
const route = require('../../utils/async-handler');
const {
  getAuthToken
} = require('../../utils/auth');
const { setWebDeviceId } = require('../../services/web-device-store');

const router = express.Router();

router.post(
  '/logout',
  route(async function (req, res) {
    req.logout?.();
    res.sendStatus(204);
  })
);

router.post(
  '/login',
  [body('email').isLength({ min: 9 }), body('password').notEmpty()],
  route(async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let { email, password } = req.body;
    const deviceId = req.get('X-Device-Id');

    if (!deviceId) {
      // Currently not required
      // return res.status(400).json({ error: 'X-Device-Id header is required' });
    }

    let user = await User.findOne({
      where: { email },
      attributes: ['salt', 'hash', 'id'],
    });

    let isPasswordCorrect = await user?.matchPassword(password);

    if (!user || !isPasswordCorrect) {
      return res.sendStatus(400);
    }

    if (deviceId) {
      if (!session.webDeviceId || session.webDeviceId !== deviceId) {
        await setWebDeviceId(tgId, deviceId);
      }
    }

    // await setWebLockUntil(tgId, null);
    res.send(getAuthToken(user.id));
  })
);

module.exports = router;

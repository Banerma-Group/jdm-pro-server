const { getSession } = require('../services/web-device-store');

module.exports = function deviceGuard() {
  return async function (req, res, next) {
    try {
      // jwt-auth should have set req.user
      const userTelegramId = req.user?.telegramId;
      const platform = req.get('X-Device-Platform');
      const headerDeviceId = req.get('X-Device-Id');

      if (platform && userTelegramId && headerDeviceId) {
        const session = await getSession(userTelegramId);
        if (session.webDeviceId && session.webDeviceId !== headerDeviceId) {
          return res.sendStatus(401);
        }
      }

      return next();
    } catch (e) {
      return next(e);
    }
  };
};

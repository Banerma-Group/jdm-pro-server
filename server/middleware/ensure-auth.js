// const { translate } = require('../bot-app/utils/translate');

module.exports = function (...roles) {
  return function (req, res, next) {
    if (req.user) {
      if (req.user.isBlocked) {
        return res.status(403).json({ error: 'errors.user-blocked' });
      }

      if (!roles.length || roles.some(role => req.user.role === role)) {
        return next();
      }
    }

    return res.sendStatus(401);
  };
};

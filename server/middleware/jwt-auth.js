const { User } = require('../../db/models');
const { verifyToken } = require('../utils/auth');

module.exports = async (req, res, next) => {
  try {
    const tokenPayload = await verifyToken(req);
    if (tokenPayload) {
      const user = await User.findOne({ where: { id: tokenPayload.userId } });
      if (!user) {
        return res.sendStatus(401);
      }
      req.user = user;
    }
    next();
  } catch (err) {
    next(err);
  }
};

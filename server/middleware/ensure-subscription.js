const { Subscription, Sequelize, sequelize } = require('../../db/models');

function ensureSubscription({ loadSubscription = false } = {}) {
  return async function (req, res, next) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      if (loadSubscription) {
        const subscription = await Subscription.findOne({
          where: { user_id: userId, status: 'active' },
        });

        req.subscription = subscription;
        req.hasActiveSubscription = !!subscription;
      } else {
        const [result] = await sequelize.query(
          'SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = :userId AND status = :status)',
          {
            replacements: { userId, status: 'active' },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        req.hasActiveSubscription = result.exists;
        req.subscription = null;
      }

      next();
    } catch (error) {
      console.error('Subscription middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = ensureSubscription;

const { UserVehicle, Sequelize, sequelize } = require('../../db/models');

function ensureSubscription({ load = false } = {}) {
  return async function (req, res, next) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      if (load) {
        const vehicle = await UserVehicle.findOne({
          where: { user_id: userId, isOccupied: false },
        });

        req.vehicle = vehicle;
        req.hasOccupiedVehicle = !!vehicle;
      } else {
        const [result] = await sequelize.query(
          'SELECT EXISTS(SELECT 1 FROM user_vehicles WHERE user_id = :userId AND is_occupied = :status)',
          {
            replacements: { userId, status: false },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        req.hasOccupiedVehicle = result.exists;
        req.vehicle = null;
      }

      next();
    } catch (error) {
      console.error('UserVehicle Occupied middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = ensureSubscription;

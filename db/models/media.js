'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Media extends Model {
    static associate({ User, Vehicle, VehicleMedia }) {
      Media.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
      Media.belongsToMany(Vehicle, {
        through: VehicleMedia,
        as: 'vehicles',
        foreignKey: 'media_id',
        otherKey: 'vehicle_id',
      });
    }
  }

  Media.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      url: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Media',
      tableName: 'media',
      underscored: true,
      timestamps: true, // createdAt / updatedAt avtomatik boshqariladi
    }
  );

  return Media;
};

'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Vehicle extends Model {
    static associate({ User, Media, VehicleMedia }) {
      Vehicle.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by_id' });
      Vehicle.belongsTo(User, { as: 'updatedBy', foreignKey: 'updated_by_id' });

      Vehicle.belongsToMany(Media, {
        through: VehicleMedia,           // yoki 'vehicle_media' deb string ham bo‘ladi
        as: 'images',
        foreignKey: 'vehicle_id',
        otherKey: 'media_id',
      });
    }
  }

  Vehicle.init(
    {
      make: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      model: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      mileage: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      stockNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('available', 'sold', 'soon', 'ask'),
        allowNull: true,
      },
      vin: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      transmission: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      youtubeLink: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isPosted: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      locale: {
        type: DataTypes.ENUM('en', 'ja'),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Vehicle',
      tableName: 'vehicles',
      underscored: true,   // created_at / updated_at bilan ishlash uchun
      timestamps: true,    // Sequelize created_at / updated_at ni boshqaradi
    }
  );

  return Vehicle;
};

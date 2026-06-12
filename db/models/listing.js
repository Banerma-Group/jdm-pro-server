'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Listing extends Model {
    static associate({ PriceHistory, Notification, Vehicle }) {
      Listing.hasMany(PriceHistory, {
        as: 'priceHistory',
        foreignKey: 'listingId',
      });
      Listing.hasMany(Notification, {
        as: 'notifications',
        foreignKey: 'listingId',
      });
      Listing.hasOne(Vehicle, {
        as: 'vehicle',
        foreignKey: 'crawlerListingId',
      });
    }
  }

  Listing.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      source: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      sourceListingId: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      maker: DataTypes.TEXT,
      model: DataTypes.TEXT,
      grade: DataTypes.TEXT,
      modelYear: DataTypes.INTEGER,
      mileageKm: DataTypes.INTEGER,
      displacementCc: DataTypes.INTEGER,
      transmission: DataTypes.TEXT,
      fuelType: DataTypes.TEXT,
      bodyType: DataTypes.TEXT,
      drivetrain: DataTypes.TEXT,
      color: DataTypes.TEXT,
      doors: DataTypes.INTEGER,
      seats: DataTypes.INTEGER,
      inspectionUntil: DataTypes.TEXT,
      repairHistory: DataTypes.BOOLEAN,
      totalPrice: DataTypes.BIGINT,
      vehiclePrice: DataTypes.BIGINT,
      prefecture: DataTypes.TEXT,
      dealerName: DataTypes.TEXT,
      photos: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      descriptionOriginal: DataTypes.TEXT,
      raw: DataTypes.JSONB,
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
      },
      consecutiveMisses: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      firstSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Listing',
      tableName: 'listings',
      underscored: true,
      timestamps: false,
    }
  );

  return Listing;
};

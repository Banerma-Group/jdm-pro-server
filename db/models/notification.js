'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate({ Listing, FilterPreset }) {
      Notification.belongsTo(Listing, {
        as: 'listing',
        foreignKey: 'listingId',
      });
      Notification.belongsTo(FilterPreset, {
        as: 'preset',
        foreignKey: 'presetId',
      });
    }
  }

  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      listingId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'listing_id',
      },
      presetId: {
        type: DataTypes.UUID,
        field: 'preset_id',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      readAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      underscored: true,
      timestamps: false,
    }
  );

  return Notification;
};

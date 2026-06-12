'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PriceHistory extends Model {
    static associate({ Listing }) {
      PriceHistory.belongsTo(Listing, {
        as: 'listing',
        foreignKey: 'listingId',
      });
    }
  }

  PriceHistory.init(
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
      price: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      observedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'PriceHistory',
      tableName: 'price_history',
      underscored: true,
      timestamps: false,
    }
  );

  return PriceHistory;
};

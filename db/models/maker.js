'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Maker extends Model {
    static associate() {}
  }

  Maker.init(
    {
      value: {
        type: DataTypes.TEXT,
        primaryKey: true,
        allowNull: false,
      },
      label: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      sites: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Maker',
      tableName: 'makers',
      underscored: true,
      timestamps: false,
    }
  );

  return Maker;
};

'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FilterPreset extends Model {
    static associate({ CrawlRun, Notification }) {
      FilterPreset.hasMany(CrawlRun, {
        as: 'crawlRuns',
        foreignKey: 'presetId',
      });
      FilterPreset.hasMany(Notification, {
        as: 'notifications',
        foreignKey: 'presetId',
      });
    }
  }

  FilterPreset.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sites: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: ['goonet', 'carsensor'],
      },
      criteria: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      autoCreateVehicles: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      telegramChatId: DataTypes.TEXT,
      lastRunAt: DataTypes.DATE,
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'FilterPreset',
      tableName: 'filter_presets',
      underscored: true,
      timestamps: false,
    }
  );

  return FilterPreset;
};

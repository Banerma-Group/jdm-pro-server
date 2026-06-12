'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CrawlRun extends Model {
    static associate({ FilterPreset }) {
      CrawlRun.belongsTo(FilterPreset, {
        as: 'preset',
        foreignKey: 'presetId',
      });
    }
  }

  CrawlRun.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      presetId: {
        type: DataTypes.UUID,
        field: 'preset_id',
      },
      site: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'running',
      },
      foundCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      newCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updatedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      errorCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      finishedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'CrawlRun',
      tableName: 'crawl_runs',
      underscored: true,
      timestamps: false,
    }
  );

  return CrawlRun;
};

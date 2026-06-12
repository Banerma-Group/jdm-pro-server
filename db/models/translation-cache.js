'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TranslationCache extends Model {
    static associate() {}
  }

  TranslationCache.init(
    {
      field: {
        type: DataTypes.TEXT,
        allowNull: false,
        primaryKey: true,
      },
      sourceText: {
        type: DataTypes.TEXT,
        allowNull: false,
        primaryKey: true,
      },
      english: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TranslationCache',
      tableName: 'translation_cache',
      underscored: true,
      timestamps: false,
    }
  );

  return TranslationCache;
};

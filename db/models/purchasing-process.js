'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchasingProcess extends Model {
    static associate({ User }) {
      PurchasingProcess.belongsTo(User, { 
        as: 'createdBy', 
        foreignKey: 'created_by_id' 
      });
      PurchasingProcess.belongsTo(User, { 
        as: 'updatedBy', 
        foreignKey: 'updated_by_id' 
      });
    }
  }

  PurchasingProcess.init(
    {
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      description: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      introduction: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'published_at',
      },
      locale: {
        type: DataTypes.ENUM('en', 'ja'),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'PurchasingProcess',
      tableName: 'purchasing_processes',
      underscored: true,
      timestamps: true,
    }
  );

  return PurchasingProcess;
};

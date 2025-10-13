'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Service extends Model {
    static associate({ User }) {
      // CreatedBy va UpdatedBy bilan aloqalar
      Service.belongsTo(User, {
        as: 'createdBy',
        foreignKey: 'created_by_id',
      });
      Service.belongsTo(User, {
        as: 'updatedBy',
        foreignKey: 'updated_by_id',
      });
    }
  }

  Service.init(
    {
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      description: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      icon: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      slug: {
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
      modelName: 'Service',
      tableName: 'services',
      underscored: true,
      timestamps: true,
    }
  );

  return Service;
};

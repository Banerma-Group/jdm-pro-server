// models/vehicleMedia.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VehicleMedia extends Model {
    static associate() {}
  }

  VehicleMedia.init(
    {
      vehicle_id: { type: DataTypes.INTEGER, allowNull: false },
      media_id:   { type: DataTypes.INTEGER, allowNull: false },
      sortOrder: DataTypes.INTEGER,
      isCover:   DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'VehicleMedia',
      tableName: 'vehicle_media',
      underscored: true,
      timestamps: true,
    }
  );

  return VehicleMedia;
};

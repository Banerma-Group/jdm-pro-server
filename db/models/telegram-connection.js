'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TelegramConnection extends Model {}

  TelegramConnection.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      chatId: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'chat_id',
      },
      telegramUserId: {
        type: DataTypes.TEXT,
        field: 'telegram_user_id',
      },
      firstName: {
        type: DataTypes.TEXT,
        field: 'first_name',
      },
      lastName: {
        type: DataTypes.TEXT,
        field: 'last_name',
      },
      username: DataTypes.TEXT,
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        field: 'last_used_at',
      },
    },
    {
      sequelize,
      modelName: 'TelegramConnection',
      tableName: 'telegram_connections',
      underscored: true,
      timestamps: false,
    }
  );

  return TelegramConnection;
};

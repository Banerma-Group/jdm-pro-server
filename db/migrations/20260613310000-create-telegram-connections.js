'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('telegram_connections', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      chat_id: { type: Sequelize.TEXT, allowNull: false },
      telegram_user_id: { type: Sequelize.TEXT, allowNull: true },
      first_name: { type: Sequelize.TEXT, allowNull: true },
      last_name: { type: Sequelize.TEXT, allowNull: true },
      username: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('telegram_connections', ['chat_id'], {
      name: 'telegram_connections_chat_id_uq',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_connections');
  },
};

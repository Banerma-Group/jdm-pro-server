'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('purchasing_processes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      title: { type: Sequelize.STRING(255), allowNull: true },
      slug: { type: Sequelize.STRING(255), allowNull: true },
      description: { type: Sequelize.JSONB, allowNull: true },
      introduction: { type: Sequelize.STRING(255), allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
      published_at: { type: Sequelize.DATE, allowNull: true },

      created_by_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'admin_users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      updated_by_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'admin_users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },

      locale: { type: Sequelize.ENUM('en', 'ja'), allowNull: true },
    });

    await queryInterface.addIndex('purchasing_processes', ['created_by_id'], { name: 'pp_created_by_id_fk' });
    await queryInterface.addIndex('purchasing_processes', ['updated_by_id'], { name: 'pp_updated_by_id_fk' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('purchasing_processes');
  },
};

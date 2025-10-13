'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vehicles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      make: { type: Sequelize.STRING(255), allowNull: true },
      model: { type: Sequelize.STRING(255), allowNull: true },
      mileage: { type: Sequelize.STRING(255), allowNull: true },
      color: { type: Sequelize.STRING(255), allowNull: true },
      slug: { type: Sequelize.STRING(255), allowNull: true },
      stock_number: { type: Sequelize.INTEGER, allowNull: true },
      status: { type: Sequelize.ENUM('available', 'sold', 'soon', 'ask'), allowNull: true },
      vin: { type: Sequelize.STRING(255), allowNull: true },
      transmission: { type: Sequelize.STRING(255), allowNull: true },
      youtube_link: { type: Sequelize.STRING(255), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      price: { type: Sequelize.STRING(255), allowNull: true },
      is_posted: { type: Sequelize.BOOLEAN, allowNull: true },
      year: { type: Sequelize.INTEGER, allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: true },
      published_at: { type: Sequelize.DATE, allowNull: true },

      created_by_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      updated_by_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },

      locale: { type: Sequelize.ENUM('en', 'ja'), allowNull: true }
    });

    // (ixtiyoriy, ammo foydali) FK lar uchun indekslar:
    await queryInterface.addIndex('vehicles', ['created_by_id'], { name: 'vehicles_created_by_id_fk' });
    await queryInterface.addIndex('vehicles', ['updated_by_id'], { name: 'vehicles_updated_by_id_fk' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vehicles');
  },
};

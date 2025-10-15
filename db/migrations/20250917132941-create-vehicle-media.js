// migrations/XXXXXXXXXXXX-create-vehicle-media.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vehicle_media', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      vehicle_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      media_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'media', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // ixtiyoriy qo‘shimcha ustunlar:
      sort_order: { type: Sequelize.INTEGER },       // tartib
      is_cover:   { type: Sequelize.BOOLEAN },       // bosh rasmmi?
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    // bir juftlikni takrorlamaslik uchun
    await queryInterface.addConstraint('vehicle_media', {
      fields: ['vehicle_id', 'media_id'],
      type: 'unique',
      name: 'vehicle_media_vehicle_id_media_id_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vehicle_media');
  },
};

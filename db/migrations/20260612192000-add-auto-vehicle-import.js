'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'filter_presets',
        'auto_create_vehicles',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'vehicles',
        'crawler_listing_id',
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'listings', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction }
      );

      await queryInterface.addIndex('vehicles', ['crawler_listing_id'], {
        name: 'vehicles_crawler_listing_id_uq',
        unique: true,
        transaction,
      });

      await queryInterface.changeColumn(
        'media',
        'url',
        {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.changeColumn(
        'media',
        'url',
        {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        { transaction }
      );
      await queryInterface.removeIndex('vehicles', 'vehicles_crawler_listing_id_uq', { transaction });
      await queryInterface.removeColumn('vehicles', 'crawler_listing_id', { transaction });
      await queryInterface.removeColumn('filter_presets', 'auto_create_vehicles', { transaction });
    });
  },
};

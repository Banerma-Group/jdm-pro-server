'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'filter_presets',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          name: { type: Sequelize.TEXT, allowNull: false },
          enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          sites: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: ['goonet', 'carsensor'],
          },
          criteria: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          telegram_chat_id: { type: Sequelize.TEXT, allowNull: true },
          last_run_at: { type: Sequelize.DATE, allowNull: true },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction }
      );

      await queryInterface.createTable(
        'listings',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          source: { type: Sequelize.TEXT, allowNull: false },
          source_listing_id: { type: Sequelize.TEXT, allowNull: false },
          url: { type: Sequelize.TEXT, allowNull: false },
          maker: { type: Sequelize.TEXT, allowNull: true },
          model: { type: Sequelize.TEXT, allowNull: true },
          grade: { type: Sequelize.TEXT, allowNull: true },
          model_year: { type: Sequelize.INTEGER, allowNull: true },
          mileage_km: { type: Sequelize.INTEGER, allowNull: true },
          displacement_cc: { type: Sequelize.INTEGER, allowNull: true },
          transmission: { type: Sequelize.TEXT, allowNull: true },
          fuel_type: { type: Sequelize.TEXT, allowNull: true },
          body_type: { type: Sequelize.TEXT, allowNull: true },
          drivetrain: { type: Sequelize.TEXT, allowNull: true },
          color: { type: Sequelize.TEXT, allowNull: true },
          doors: { type: Sequelize.INTEGER, allowNull: true },
          seats: { type: Sequelize.INTEGER, allowNull: true },
          inspection_until: { type: Sequelize.TEXT, allowNull: true },
          repair_history: { type: Sequelize.BOOLEAN, allowNull: true },
          total_price: { type: Sequelize.BIGINT, allowNull: true },
          vehicle_price: { type: Sequelize.BIGINT, allowNull: true },
          prefecture: { type: Sequelize.TEXT, allowNull: true },
          dealer_name: { type: Sequelize.TEXT, allowNull: true },
          photos: { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
          description_original: { type: Sequelize.TEXT, allowNull: true },
          raw: { type: Sequelize.JSONB, allowNull: true },
          status: {
            type: Sequelize.TEXT,
            allowNull: false,
            defaultValue: 'active',
          },
          consecutive_misses: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          first_seen_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          last_seen_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction }
      );

      await queryInterface.createTable(
        'makers',
        {
          value: { type: Sequelize.TEXT, primaryKey: true, allowNull: false },
          label: { type: Sequelize.TEXT, allowNull: false },
          sites: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction }
      );

      await queryInterface.createTable(
        'translation_cache',
        {
          field: { type: Sequelize.TEXT, allowNull: false },
          source_text: { type: Sequelize.TEXT, allowNull: false },
          english: { type: Sequelize.TEXT, allowNull: false },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction }
      );

      await queryInterface.addConstraint('translation_cache', {
        fields: ['field', 'source_text'],
        type: 'primary key',
        name: 'translation_cache_field_source_text_pk',
        transaction,
      });

      await queryInterface.createTable(
        'crawl_runs',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          preset_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'filter_presets', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          site: { type: Sequelize.TEXT, allowNull: false },
          status: { type: Sequelize.TEXT, allowNull: false, defaultValue: 'running' },
          found_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          new_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          updated_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          error_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          started_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          finished_at: { type: Sequelize.DATE, allowNull: true },
        },
        { transaction }
      );

      await queryInterface.createTable(
        'price_history',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'listings', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          price: { type: Sequelize.BIGINT, allowNull: false },
          observed_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction }
      );

      await queryInterface.createTable(
        'notifications',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'listings', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          preset_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'filter_presets', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          read_at: { type: Sequelize.DATE, allowNull: true },
        },
        { transaction }
      );

      await queryInterface.addIndex('listings', ['source', 'source_listing_id'], {
        name: 'listings_source_id_uq',
        unique: true,
        transaction,
      });
      await queryInterface.addIndex('price_history', ['listing_id'], {
        name: 'price_history_listing_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('notifications', { transaction });
      await queryInterface.dropTable('price_history', { transaction });
      await queryInterface.dropTable('crawl_runs', { transaction });
      await queryInterface.dropTable('translation_cache', { transaction });
      await queryInterface.dropTable('makers', { transaction });
      await queryInterface.dropTable('listings', { transaction });
      await queryInterface.dropTable('filter_presets', { transaction });
    });
  },
};

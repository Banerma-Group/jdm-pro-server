'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('services', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

      title: { type: Sequelize.STRING(255) },
      description: { type: Sequelize.JSONB },
      icon: { type: Sequelize.STRING(255) },
      slug: { type: Sequelize.STRING(255) },

      created_at: { type: Sequelize.DATE },
      updated_at: { type: Sequelize.DATE },
      published_at: { type: Sequelize.DATE },

      created_by_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      updated_by_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },

      locale: { type: Sequelize.ENUM('en', 'ja') },
    });

    // Indekslar (screenshotdagi kabi):
    await queryInterface.addIndex(
      'services',
      ['locale', 'published_at'],
      { name: 'services_documents_idx' }
    );
    await queryInterface.addIndex('services', ['created_by_id'], { name: 'services_created_by_id_fk' });
    await queryInterface.addIndex('services', ['updated_by_id'], { name: 'services_updated_by_id_fk' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('services');
  },
};

'use strict';

/**
 * Dedupe notifications per (listing, preset) so that re-running a preset
 * (which re-discovers the same listings every hour) never creates duplicate
 * notification rows. notifyMatches() relies on this for findOrCreate.
 *
 * preset_id is nullable, so the index is partial (NULLs are excluded — two
 * notifications with a NULL preset_id are never considered duplicates).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('notifications', ['listing_id', 'preset_id'], {
      name: 'notifications_listing_preset_uq',
      unique: true,
      where: { preset_id: { [require('sequelize').Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('notifications', 'notifications_listing_preset_uq');
  },
};

const express = require('express');
const { body } = require('express-validator');
const { asyncRoute, runValidation, buildPagination, buildOrder } = require('./_helpers');
const { serialize } = require('../../db/serializers');
const { Op } = require('../../db/models');
const pagination = require('./pagination');

/**
 * createCrudRouter
 * @param {object} opts
 *  - model: Sequelize model (Vehicle/Service/...)
 *  - serializer: jsonapi-serializer instance
 *  - searchable (array): where-lik qidirishda LIKE ishlatadigan maydonlar
 *  - createRules/updateRules: express-validator rules
 *  - defaultSort: default order by column (camelCase)
 *  - include: sequelize include (relations)
 *  - pickFields: yaratish/yangilashda ruxsat etilgan ustunlar (camelCase)
 */
function createCrudRouter({
  model,
  searchable = [],
  createRules = [], updateRules = [],
  defaultSort = 'createdAt',
  include = [],
  pickFields,
}) {
  const router = express.Router();

  // LIST
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const { offset, limit, page, pageSize } = buildPagination(req);
      const order = buildOrder(req, defaultSort);

      // simple filters
      const where = {};
      if (req.query.locale) where.locale = req.query.locale;
      if ('published' in req.query) {
        where.publishedAt = req.query.published ? { $ne: null } : null;
      }

      // search
      if (req.query.search && searchable.length) {
        where[Op.or] = searchable.map((f) => ({ [f]: { [Op.iLike]: `%${req.query.search}%` } }));
      }

      const { rows, count } = await model.findAndCountAll({
        where,
        include,
        order,
        offset,
        limit,
      });

      const totalPages = Math.ceil(count / pageSize);
      rows.pagination = pagination()
      const payload = serialize({
        data: rows,
        pagination: { page, pageSize, total: count, totalPages },
      });

      res.json(payload);
    })
  );

  // GET by id
  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const row = await model.findByPk(req.params.id, { include });
      if (!row) return res.sendStatus(404);
      res.json(serialize(row));
    })
  );

  // CREATE
  router.post(
    '/',
    createRules,
    asyncRoute(async (req, res) => {
      runValidation(req);

      // audit fields
      if (req.user?.id) req.body.createdById = req.user.id;

      // pick allowed fields only
      const data = {};
      pickFields.forEach((k) => {
        if (req.body[k] !== undefined) data[k] = req.body[k];
      });

      const created = await model.create(data);
      res.status(201).json(serialize(created));
    })
  );

  // UPDATE (partial)
  router.patch(
    '/:id',
    updateRules,
    asyncRoute(async (req, res) => {
      runValidation(req);

      const row = await model.findByPk(req.params.id);
      if (!row) return res.sendStatus(404);

      if (req.user?.id) req.body.updatedById = req.user.id;

      const data = {};
      pickFields.forEach((k) => {
        if (req.body[k] !== undefined) data[k] = req.body[k];
      });

      await row.update(data);
      res.json(serialize(row));
    })
  );

  // DELETE
  router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
      const row = await model.findByPk(req.params.id);
      if (!row) return res.sendStatus(404);
      await row.destroy();
      res.sendStatus(204);
    })
  );

  return router;
}

module.exports = { createCrudRouter };

const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { PurchasingProcess, User, Op } = require('../../../db/models');
const { serialize, deserialize } = require('../../../db/serializers');
const pagination = require('../../utils/pagination');
const qps = require('../../utils/qps')();

const router = express.Router();

// LIST
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = qps(req.query);
    query.where = { ...query.where };

    if (req.query.search) {
      query.where[Op.or] = [
        { title: { [Op.iLike]: `%${req.query.search}%` } },
        { slug:  { [Op.iLike]: `%${req.query.search}%` } },
        { introduction: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }
    if (req.query.locale) query.where.locale = req.query.locale;

    query.include = [
      { model: User, as: 'createdBy' },
      { model: User, as: 'updatedBy' },
    ];

    const { rows, count } = await PurchasingProcess.findAndCountAll(query);
    rows.pagination = pagination(query.limit, query.offset, count);
    res.send(serialize(rows));
  })
);

// GET by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await PurchasingProcess.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createdBy' },
        { model: User, as: 'updatedBy' },
      ],
    });
    if (!row) return res.sendStatus(404);
    res.send(serialize(row));
  })
);

// CREATE
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const json = await deserialize(req.body);
    json.createdById = req.user?.id || null;

    const created = await PurchasingProcess.create(json);
    res.status(201).send(serialize(created));
  })
);

// UPDATE
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const json = await deserialize(req.body);
    const row = await PurchasingProcess.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);

    json.updatedById = req.user?.id || null;
    await row.update(json);
    res.send(serialize(row));
  })
);

// DELETE
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await PurchasingProcess.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    await row.destroy();
    res.sendStatus(204);
  })
);

module.exports = router;

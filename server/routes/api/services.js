const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { Service, User, Op } = require('../../../db/models');
const { deserialize } = require('../../../db/serializers');
const pagination = require('../../utils/pagination');
const qps = require('../../utils/qps')();

const router = express.Router();

// LIST
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = qps(req.query);

    if (req.query.search) {
      query.where[Op.or] = [
        { title: { [Op.iLike]: `%${req.query.search}%` } },
        { slug:  { [Op.iLike]: `%${req.query.search}%` } },
        { icon:  { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    query.include = [
      { model: User, as: 'createdBy' },
      { model: User, as: 'updatedBy' },
    ];

    delete query.where.search
    const { rows, count } = await Service.findAndCountAll(query);
    
    res.send({data: rows, pagination: pagination(query.limit, query.offset, count)});
  })
);

// GET by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await Service.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createdBy' },
        { model: User, as: 'updatedBy' },
      ],
    });
    if (!row) return res.sendStatus(404);
    res.send({data: row});
  })
);

// CREATE
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const json = await deserialize(req.body);
    json.createdById = req.user?.id || null;

    const created = await Service.create(json);
    res.status(201).send({data: created});
  })
);

// UPDATE
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const json = await deserialize(req.body);
    const row = await Service.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);

    json.updatedById = req.user?.id || null;
    await row.update(json);
    res.send({data: row});
  })
);

// DELETE
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await Service.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    await row.destroy();
    res.sendStatus(204);
  })
);

module.exports = router;

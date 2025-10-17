const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { Vehicle, User, Op, sequelize, Media, VehicleMedia } = require('../../../db/models');
const { serialize, deserialize } = require('../../../db/serializers');
const pagination = require('../../utils/pagination');
const { buildThroughPayload } = require('../../utils/_helpers');
const qps = require('../../utils/qps')();

const router = express.Router();

// LIST
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = qps(req.query);
    // oddiy search
    if (req.query.search) {
      query.where[Op.or] = [
        { make: { [Op.iLike]: `%${req.query.search}%` } },
        { model: { [Op.iLike]: `%${req.query.search}%` } },
        { color: { [Op.iLike]: `%${req.query.search}%` } },
        { vin:   { [Op.iLike]: `%${req.query.search}%` } },
        { slug:  { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    // query.where = {
    //   ...query.where,
    //   publishedAt: { [Op.ne]: null }
    // };
    query.include = [
      { model: User, as: 'createdBy' },
      { model: User, as: 'updatedBy' },
      {
        model: Media,
        as: 'images',
        through: { attributes: ['sort_order'] }, // pivotdan faqat sort_order oling
      },
    ];

    delete query.where.search
    const { rows, count } = await Vehicle.findAndCountAll(query);

    const data = rows.map(row => {
      const json = row.toJSON();

      if (Array.isArray(json.images)) {
        json.images = json.images.map(img => {
          const { VehicleMedia, ...rest } = img;
          return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
        });
      }

      return json;
    });
    res.send({data, pagination: pagination(query.limit, query.offset, count)});
  })
);

// GET by id
router.get('/:id', asyncHandler(async (req, res) => {
  const row = await Vehicle.findByPk(req.params.id, {
    include: [
      { model: User, as: 'createdBy' },
      { model: User, as: 'updatedBy' },
      {
        model: Media,
        as: 'images',
        through: { attributes: ['sort_order'] }, // pivotdan faqat sort_order oling
      },
    ],
  });

  if (!row) return res.sendStatus(404);

  // Flatten: VehicleMedia ni olib tashlab, sort_order ni yuqori darajaga ko‘taramiz
  const json = row.toJSON();
  if (Array.isArray(json.images)) {
    json.images = json.images.map(img => {
      const { VehicleMedia, ...rest } = img;
      return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
    });
  }

  res.send({ data: json });
}));

// CREATE Vehicle with images
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { images = [], ...attrs } = body;

    attrs.createdById = req.user?.id || null;

    const created = await sequelize.transaction(async (t) => {
      const vehicle = await Vehicle.create(attrs, { transaction: t });

      if (images?.length) {
        // sanitize: faqat id/sort_order
        const seen = new Set();
        const rows = images
          .map((x, i) => ({
            vehicle_id: vehicle.id,
            media_id: Number(x?.id),
            sortOrder: Number(x?.sort_order ?? i + 1),
          }))
          .filter((r) => Number.isFinite(r.media_id) && !seen.has(r.media_id) && seen.add(r.media_id));

        if (rows.length) {
          await VehicleMedia.destroy({ where: { vehicle_id: vehicle.id }, transaction: t });
          await VehicleMedia.bulkCreate(rows, { transaction: t });
        }
      }

      return vehicle;
    });

    // javobda rasmlar + sort_order (flatten)
    const withImages = await Vehicle.findByPk(created.id, {
      include: [
        {
          model: Media,
          as: 'images',
          through: { attributes: ['sort_order'] },
        },
      ],
    });

    const json = withImages.toJSON();
    if (Array.isArray(json.images)) {
      json.images = json.images.map((img) => {
        const { VehicleMedia, ...rest } = img;
        return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
      });
    }

    res.status(201).send({ data: json });
  })
);
// UPDATE Vehicle + replace images order (PATCH)
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { images = [], ...attrs } = req.body || {};

  const updated = await sequelize.transaction(async (t) => {
    const vehicle = await Vehicle.findByPk(id, { transaction: t });
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found' });

    await vehicle.update(attrs, { transaction: t });

      if (images?.length) {
        // sanitize: faqat id/sort_order
        const seen = new Set();
        const rows = images
          .map((x, i) => ({
            vehicle_id: vehicle.id,
            media_id: Number(x?.id),
            sortOrder: Number(x?.sort_order ?? i + 1),
          }))
          .filter((r) => Number.isFinite(r.media_id) && !seen.has(r.media_id) && seen.add(r.media_id));

        if (rows.length) {
          await VehicleMedia.destroy({ where: { vehicle_id: vehicle.id }, transaction: t });
          await VehicleMedia.bulkCreate(rows, { transaction: t });
        }
      }

    return vehicle;
  });

  const withImages = await Vehicle.findByPk(updated.id, {
    include: [{ model: Media, as: 'images', through: { attributes: ['sort_order'] } }],
  });

  const json = withImages.toJSON();
    if (Array.isArray(json.images)) {
      json.images = json.images.map(img => {
        const { VehicleMedia, ...rest } = img;
        return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
      });
    }
  res.send({ data: json });
}));


// DELETE
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await Vehicle.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    await row.destroy();
    res.sendStatus(204);
  })
);

module.exports = router;

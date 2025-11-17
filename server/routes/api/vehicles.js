const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { Vehicle, User, Op, sequelize, Media, VehicleMedia } = require('../../../db/models');
const aws = require('../../services/aws'); // sizdagi upload/deleteObject va h.k.
const pagination = require('../../utils/pagination');
const { keyFromUrl } = require('../../utils/_helpers');
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
      {
        model: Media,
        as: 'youtubeCover',
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
      {
        model: Media,
        as: 'youtubeCover',
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

  delete json.youtube_cover_id;

  res.send({ data: json });
}));

// CREATE Vehicle with images
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { images = [], youtubeCover, ...attrs } = body;

    attrs.createdById = req.user?.id || null;

    if (youtubeCover && youtubeCover.id) {
      attrs.youtube_cover_id = youtubeCover.id;
    }

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
        { model: Media, as: 'youtubeCover' },
      ],
    });

    const json = withImages.toJSON();
    if (Array.isArray(json.images)) {
      json.images = json.images.map((img) => {
        const { VehicleMedia, ...rest } = img;
        return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
      });
    }
    delete json.youtube_cover_id;
    
    res.status(201).send({ data: json });
  })
);

// UPDATE Vehicle + replace images order (PATCH)
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { images = [], youtubeCover, ...attrs } = req.body || {};

  const updated = await sequelize.transaction(async (t) => {
    const vehicle = await Vehicle.findByPk(id, { transaction: t });
    if (!vehicle) return res.status(404).send({ error: 'Vehicle not found' });

    if (youtubeCover && youtubeCover.id) {
      attrs.youtube_cover_id = youtubeCover.id;
    }

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
    include: [
      { model: Media, as: 'images', through: { attributes: ['sort_order'] } },
      { model: Media, as: 'youtubeCover' },
    ],
  });

  const json = withImages.toJSON();
  if (Array.isArray(json.images)) {
      json.images = json.images.map(img => {
        const { VehicleMedia, ...rest } = img;
        return { ...rest, sort_order: VehicleMedia?.sort_order ?? null };
      });
  }
  
  delete json.youtube_cover_id;
  
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

// BULK DELETE (S3 + DB + Pivot)
router.post(
  '/bulk-delete',
  asyncHandler(async (req, res) => {
    const { ids } = req.body; // [1, 2, 3, ...]

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty IDs array' });
    }

    const vehicles = await Vehicle.findAll({
      where: { id: ids },
    });

    if (!vehicles.length) {
      return res.status(404).json({ message: 'No vehicle found for given IDs' });
    }

    const keys = vehicles
      .map((m) => keyFromUrl(m.url))
      .filter(Boolean);

    if (keys.length) {
      try {
        await aws.deleteObjects(keys); // AWS helper function (pastda)
      } catch (err) {
        console.error('S3 bulk delete error:', err);
      }
    }

    await VehicleMedia.destroy({
      where: { vehicle_id: ids },
    });

    await Vehicle.destroy({
      where: { id: ids },
    });

    res.sendStatus(204);
  })
);

module.exports = router;
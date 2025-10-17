const express = require('express');

const asyncHandler = require('../../utils/async-handler');
const { Media, Op, User, VehicleMedia } = require('../../../db/models');
const { serialize } = require('../../../db/serializers');
const aws = require('../../services/aws'); // sizdagi upload/deleteObject va h.k.
const qps = require('../../utils/qps')();
const pagination = require('../../utils/pagination');
const { buildS3Key, bufferToStream, keyFromUrl, uploadMulter } = require('../../utils/_helpers');

const router = express.Router();

/**
 * 1) PRESIGN
 * POST /media/presign
 * Body: { items: [{ name, type, size }] }
 * Return: { items: [{ key, url, contentType }] }
 */
router.post(
  '/presign',
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items required' });

    // Xavfsizlik: hajm va MIME tekshiruv (oddiy misol)
    const MAX = 25 * 1024 * 1024;
    for (const it of items) {
      if (!/^image\//.test(it.type)) return res.status(415).json({ error: 'only images allowed' });
      if (it.size > MAX) return res.status(413).json({ error: 'file too large' });
    }

    const out = [];
    for (const it of items) {
      const key = buildS3Key(it.name);
      // sizdagi getSignedUploadUrl: (path, props) -> signed URL
      const url = await aws.getSignedUploadUrl(key, { ContentType: it.type });
      out.push({ key, url, contentType: it.type, name: it.name });
    }
    res.json({ items: out });
  })
);

/**
 * 2) FINALIZE
 * POST /media/finalize
 * Body: { items: [{ key, name }] }
 * Return: { items: [{ ok, item? | error? }] }
 */
router.post(
  '/finalize',
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items required' });

    const results = [];
    for (const it of items) {
      const exists = await aws.headObjectExists(it.key); // S3 da bor-yo'qligini tekshir
      if (!exists) {
        results.push({ ok: false, key: it.key, error: 'not uploaded' });
        continue;
      }
      // public URL ni aniq yig'ib beramiz
      const url = `https://${process.env.S3_BUCKET}.s3-${process.env.S3_REGION}.amazonaws.com/${it.key}`;

      const media = await Media.create({
        url,
        name: it.name,
        createdById: req.user?.id || 1,
      });
      results.push(media);
    }

    res.status(201).json({data: results});
  })
);

// LIST
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = qps(req.query);

    query.order = [['created_at', 'DESC']];
    if (req.query.search) {
      query.where[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.search}%` } },
        { url:  { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    query.include = [
      { model: User, as: 'user' },
    ]

    delete query.where.search
    const { rows, count } = await Media.findAndCountAll(query);
    const paginationData = pagination(query.limit, query.offset, count)

    res.send({
      data: rows, pagination: paginationData
    });
  })
);

// GET by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await Media.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    res.send(serialize(row));
  })
);

// CREATE (upload)
router.post(
  '/',
  uploadMulter.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const key = buildS3Key(req.file.originalname);
    const stream = bufferToStream(req.file.buffer);

    // Agar resize kerak bo‘lsa, shu yerda o‘rnating:
    // const url = await aws.resizeAndUploadImage(key, stream, { width: 1600, height: 1600 });
    const url = await aws.upload(key, stream);

    const media = await Media.create({
      url,
      name: req.body?.name || req.file.originalname,
      createdById: req.user?.id || null,
    });

    res.status(201).send(serialize(media));
  })
);

// DELETE (S3 + DB)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const media = await Media.findByPk(req.params.id);
    if (!media) return res.sendStatus(404);

    const key = keyFromUrl(media.url);
    if (key) {
      try { await aws.deleteObject(key); } catch (e) { /* log for diagnostics */ }
    }
    await media.destroy();
    res.sendStatus(204);
  })
);

router.post(
  '/bulk-delete',
  asyncHandler(async (req, res) => {
    const { ids } = req.body; // [1, 2, 3, ...]

    // 1️⃣ Validatsiya
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty IDs array' });
    }

    // 2️⃣ Medialarni topamiz (DB)
    const medias = await Media.findAll({
      where: { id: ids },
    });

    if (!medias.length) {
      return res.status(404).json({ message: 'No media found for given IDs' });
    }

    // 3️⃣ AWS S3 keys tayyorlash
    const keys = medias
      .map((m) => keyFromUrl(m.url))
      .filter(Boolean);

    // 4️⃣ AWS S3 dan fayllarni o‘chirish
    if (keys.length) {
      try {
        await aws.deleteObjects(keys); // AWS helper function (pastda)
      } catch (err) {
        console.error('S3 bulk delete error:', err);
      }
    }

    // 5️⃣ Pivot (VehicleMedia) dan bog‘lanmalarni tozalash
    await VehicleMedia.destroy({
      where: { media_id: ids },
    });

    // 6️⃣ Media jadvalidan yozuvlarni o‘chirish
    await Media.destroy({
      where: { id: ids },
    });

    // 7️⃣ Javob qaytarish
    res.sendStatus(204);
  })
);

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');

const asyncHandler = require('../../utils/async-handler');
const { Media, Op, User } = require('../../../db/models');
const { serialize } = require('../../../db/serializers');
const aws = require('../../services/aws'); // sizdagi upload/deleteObject va h.k.
const qps = require('../../utils/qps')();
const pagination = require('../../utils/pagination');

const router = express.Router();

// ---- Multer (memory) ----
const uploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

function bufferToStream(buffer) {
  const rs = new Readable();
  rs._read = () => {};
  rs.push(buffer);
  rs.push(null);
  return rs;
}

function buildS3Key(userId, originalName) {
  const base = path.parse(originalName).name.replace(/[^\w-]+/g, '-').slice(0, 60);
  const ext = path.extname(originalName) || '.jpg';
  const ts = Date.now();
  const uid = userId || 'anon';
  return `media/${uid}/${ts}-${base}${ext}`;
}

function keyFromUrl(url) {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

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
      const key = buildS3Key(req.user?.id, it.name);
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

    const key = buildS3Key(req.user?.id, req.file.originalname);
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

module.exports = router;

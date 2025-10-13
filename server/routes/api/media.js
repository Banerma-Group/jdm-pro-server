const express = require('express');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');

const asyncHandler = require('../../utils/async-handler');
const { Media } = require('../../../db/models');
const { serialize } = require('../../../db/serializers');
const aws = require('../../services/aws'); // sizdagi upload/deleteObject va h.k.

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
  const base = path.parse(originalName).name.replace(/[^\w.-]+/g, '-').slice(0, 60);
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

// LIST
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize ?? '20', 10), 1), 100);
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    const order = [[req.query.sort || 'createdAt', (req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC']];

    const where = {};
    if (req.query.search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.search}%` } },
        { url:  { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const { rows, count } = await Media.findAndCountAll({ where, order, offset, limit });
    rows.pagination = { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) };
    res.send(serialize(rows));
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

// UPDATE (faqat name, xohlasangiz url ham qo‘shing)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const media = await Media.findByPk(req.params.id);
    if (!media) return res.sendStatus(404);

    await media.update({
      name: req.body?.name ?? media.name,
      updatedById: req.user?.id || null,
    });

    res.send(serialize(media));
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

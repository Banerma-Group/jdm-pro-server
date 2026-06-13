const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const {
  Listing,
  PriceHistory,
  FilterPreset,
  Notification,
  Maker,
  Vehicle,
  Op,
  sequelize,
} = require('../../../db/models');
const {
  discoveryQueue,
  listingQueue,
  defaultJobOpts,
  JOB_DISCOVER_PRESET,
  JOB_CRAWL_LISTING,
} = require('../../queues/crawler');
const { getAdapterForUrl } = require('../../crawler/adapters');
const { ensurePresetSchedule, removePresetSchedule } = require('../../crawler/scheduler');
const { fetchMakerOptions } = require('../../crawler/makers');
const { createVehicleFromListing } = require('../../crawler/import-vehicle');
const { translateDescription } = require('../../crawler/translate-description');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOBS_QUEUE_TIMEOUT_MS = Number(process.env.JOBS_QUEUE_TIMEOUT_MS || 2000);

class QueueTimeoutError extends Error {
  constructor(queue) {
    super('Job queues unavailable');
    this.queue = queue;
  }
}

function withQueueTimeout(promise, queue) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new QueueTimeoutError(queue)), JOBS_QUEUE_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function toPlain(row) {
  if (!row) return row;
  const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
  const normalized = normalizeNumbers(plain);
  if (normalized.vehicle?.id) normalized.vehicleId = normalized.vehicle.id;
  return normalized;
}

function normalizeNumbers(value) {
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value instanceof Date) return value;
  if (!value || typeof value !== 'object') return value;

  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    if (['totalPrice', 'vehiclePrice', 'price'].includes(key) && raw != null) {
      next[key] = Number(raw);
    } else {
      next[key] = normalizeNumbers(raw);
    }
  }
  return next;
}

function normalizeDisplayText(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function makerLabel(value) {
  if (!value) return 'all makers';
  return String(value)
    .split('-')
    .map(word => (word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join('-');
}

function normalizeMakerOption(value, sites = {}) {
  const normalized = value == null ? '' : normalizeDisplayText(value).toLowerCase();
  return { value: normalized, label: makerLabel(normalized), sites };
}

function parseIntQuery(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeCriteria(criteria = {}) {
  const out = {};
  const stringFields = ['maker'];
  const numberFields = ['priceMin', 'priceMax', 'yearMin', 'yearMax', 'mileageMin', 'mileageMax'];
  const arrayFields = ['models', 'bodyTypes', 'fuelTypes', 'transmissions', 'prefectures'];

  for (const field of stringFields) {
    if (typeof criteria[field] === 'string' && criteria[field].trim()) out[field] = criteria[field].trim();
  }
  for (const field of numberFields) {
    const value = parseIntQuery(criteria[field]);
    if (value != null) out[field] = value;
  }
  for (const field of arrayFields) {
    if (Array.isArray(criteria[field])) out[field] = criteria[field].filter(item => typeof item === 'string' && item.trim());
  }

  return out;
}

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const where = {};
    const priceMin = parseIntQuery(req.query.priceMin);
    const priceMax = parseIntQuery(req.query.priceMax);
    const limit = Math.min(parseIntQuery(req.query.limit) || 50, 200);
    const offset = parseIntQuery(req.query.offset) || 0;

    if (req.query.source) where.source = req.query.source;
    if (req.query.maker) where.maker = req.query.maker;
    if (req.query.status) where.status = req.query.status;
    if (priceMin != null || priceMax != null) {
      where.totalPrice = {};
      if (priceMin != null) where.totalPrice[Op.gte] = priceMin;
      if (priceMax != null) where.totalPrice[Op.lte] = priceMax;
    }

    const { rows, count } = await Listing.findAndCountAll({
      where,
      include: [{ model: Vehicle, as: 'vehicle', attributes: ['id'] }],
      order: [['last_seen_at', 'DESC']],
      limit,
      offset,
    });

    res.send({
      rows: rows.map(toPlain),
      total: count,
      limit,
      offset,
    });
  })
);

router.get(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const listing = await Listing.findByPk(req.params.id, {
      include: [{ model: Vehicle, as: 'vehicle', attributes: ['id'] }],
    });
    if (!listing) return res.status(404).send({ error: 'not found' });

    const prices = await PriceHistory.findAll({
      where: { listingId: req.params.id },
      order: [['observed_at', 'ASC']],
    });

    res.send({
      ...toPlain(listing),
      priceHistory: prices.map(toPlain),
    });
  })
);

router.get(
  '/makers',
  asyncHandler(async (req, res) => {
    const persisted = await Maker.findAll({ order: [['label', 'ASC']] });
    if (persisted.length) {
      return res.send({
        rows: [
          normalizeMakerOption(''),
          ...persisted.map(row => {
            const plain = toPlain(row);
            return normalizeMakerOption(plain.value, plain.sites || {});
          }),
        ],
      });
    }

    const crawlerOptions = await fetchMakerOptions();
    if (crawlerOptions.length > 1) {
      await Promise.all(
        crawlerOptions
          .filter(option => option.value)
          .map(option =>
            Maker.upsert({
              value: option.value,
              label: option.label,
              sites: option.sites || {},
              updatedAt: new Date(),
            })
          )
      );
      return res.send({ rows: crawlerOptions });
    }

    const listingMakers = await Listing.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('maker')), 'maker']],
      where: { maker: { [Op.ne]: null } },
      order: [['maker', 'ASC']],
    });

    res.send({
      rows: [
        normalizeMakerOption(''),
        ...listingMakers
          .map(row => normalizeMakerOption(row.get('maker')))
          .filter(option => option.value),
      ],
    });
  })
);

router.get(
  '/presets',
  asyncHandler(async (req, res) => {
    const rows = await FilterPreset.findAll({ order: [['created_at', 'DESC']] });
    res.send(rows.map(toPlain));
  })
);

router.post(
  '/listings/:id/import-vehicle',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const { vehicle, created } = await createVehicleFromListing(req.params.id);
    res.status(created ? 201 : 200).send({ data: toPlain(vehicle), created });
  })
);

router.post(
  '/listings/:id/translate',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const listing = await Listing.findByPk(req.params.id);
    if (!listing) return res.status(404).send({ error: 'not found' });

    // Serve a cached translation if we already have one.
    if (listing.descriptionTranslated) {
      return res.send({ translation: listing.descriptionTranslated, cached: true });
    }

    if (!listing.descriptionOriginal) {
      return res.send({ translation: null, cached: false });
    }

    const translation = await translateDescription(listing.descriptionOriginal);
    if (!translation) {
      return res.status(503).send({ error: 'translation unavailable' });
    }

    listing.descriptionTranslated = translation;
    await listing.save();

    res.send({ translation, cached: false });
  })
);

router.post(
  '/presets',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string') {
      return res.status(400).send({ error: 'name required' });
    }

    const row = await FilterPreset.create({
      name: body.name.trim(),
      enabled: body.enabled ?? true,
      sites: Array.isArray(body.sites) && body.sites.length ? body.sites : ['goonet', 'carsensor'],
      criteria: sanitizeCriteria(body.criteria),
      autoCreateVehicles: Boolean(body.autoCreateVehicles),
      telegramChatId: body.telegramChatId || null,
    });

    await ensurePresetSchedule(row);
    res.status(201).send(toPlain(row));
  })
);

router.patch(
  '/presets/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const row = await FilterPreset.findByPk(req.params.id);
    if (!row) return res.status(404).send({ error: 'not found' });

    const body = req.body || {};
    const patch = {};
    if ('name' in body) patch.name = body.name;
    if ('enabled' in body) patch.enabled = body.enabled;
    if ('sites' in body) patch.sites = body.sites;
    if ('autoCreateVehicles' in body) patch.autoCreateVehicles = Boolean(body.autoCreateVehicles);
    if ('telegramChatId' in body) patch.telegramChatId = body.telegramChatId || null;
    if ('criteria' in body) patch.criteria = sanitizeCriteria(body.criteria);

    await row.update(patch);
    await ensurePresetSchedule(row);
    res.send(toPlain(row));
  })
);

router.delete(
  '/presets/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    await removePresetSchedule(req.params.id);
    const count = await FilterPreset.destroy({ where: { id: req.params.id } });
    if (!count) return res.status(404).send({ error: 'not found' });

    res.send({ ok: true });
  })
);

router.post(
  '/presets/:id/run',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const row = await FilterPreset.findByPk(req.params.id);
    if (!row) return res.status(404).send({ error: 'not found' });

    const job = await discoveryQueue.add(
      JOB_DISCOVER_PRESET,
      { presetId: row.id, sites: row.sites, criteria: row.criteria || {} },
      defaultJobOpts
    );

    res.send({ ok: true, jobId: job.id });
  })
);

router.post(
  '/crawl/url',
  asyncHandler(async (req, res) => {
    const target = req.body?.url;
    if (!target) return res.status(400).send({ error: 'url required' });

    const adapter = getAdapterForUrl(target);
    if (!adapter) return res.status(400).send({ error: 'unsupported site' });

    const job = await listingQueue.add(JOB_CRAWL_LISTING, { site: adapter.site, url: target }, defaultJobOpts);
    res.status(202).send({ jobId: job.id, site: adapter.site });
  })
);

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    let discovery;
    let listing;
    let discoveryFailed;
    let listingFailed;

    try {
      [discovery, listing, discoveryFailed, listingFailed] = await Promise.all([
        withQueueTimeout(discoveryQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed'), 'discovery'),
        withQueueTimeout(listingQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed'), 'listing'),
        withQueueTimeout(discoveryQueue.getFailed(0, 20), 'discovery'),
        withQueueTimeout(listingQueue.getFailed(0, 20), 'listing'),
      ]);
    } catch (err) {
      if (err instanceof QueueTimeoutError) {
        return res.status(503).send({ error: err.message, queue: err.queue });
      }

      throw err;
    }

    res.send({
      discovery,
      listing,
      discovery_failed: discoveryFailed.map(job => ({
        id: job.id,
        name: job.name,
        reason: job.failedReason,
        data: job.data,
      })),
      listing_failed: listingFailed.map(job => ({
        id: job.id,
        name: job.name,
        reason: job.failedReason,
        data: job.data,
      })),
    });
  })
);

router.post(
  '/jobs/:queue/:id/retry',
  asyncHandler(async (req, res) => {
    const queue = req.params.queue === 'discovery' ? discoveryQueue : req.params.queue === 'listing' ? listingQueue : null;
    if (!queue) return res.status(404).send({ error: 'queue not found' });

    const job = await queue.getJob(req.params.id);
    if (!job) return res.status(404).send({ error: 'not found' });

    await job.retry();
    res.send({ ok: true });
  })
);

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const rows = await Notification.findAll({
      include: [{ model: Listing, as: 'listing' }],
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    res.send(
      rows.map(row => {
        const plain = toPlain(row);
        const { listing, ...n } = plain;
        return { n, listing: listing || null };
      })
    );
  })
);

router.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });

    const row = await Notification.findByPk(req.params.id);
    if (!row) return res.status(404).send({ error: 'not found' });

    await row.update({ readAt: new Date() });
    res.send({ ok: true });
  })
);

module.exports = router;

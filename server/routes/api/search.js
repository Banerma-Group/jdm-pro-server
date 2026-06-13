const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { Listing, Vehicle, Media, Op } = require('../../../db/models');

const router = express.Router();

const LISTING_TEXT_COLUMNS = [
  'maker',
  'model',
  'grade',
  'dealerName',
  'prefecture',
  'color',
  'descriptionTranslated',
  'descriptionOriginal',
];

const VEHICLE_TEXT_COLUMNS = ['make', 'model', 'color', 'vin', 'slug'];

function ilikeAny(columns, term) {
  return { [Op.or]: columns.map(column => ({ [column]: { [Op.iLike]: `%${term}%` } })) };
}

async function searchListings(term, limit) {
  const { rows, count } = await Listing.findAndCountAll({
    where: ilikeAny(LISTING_TEXT_COLUMNS, term),
    attributes: [
      'id',
      'source',
      'maker',
      'model',
      'grade',
      'modelYear',
      'mileageKm',
      'totalPrice',
      'prefecture',
      'status',
      'photos',
    ],
    order: [['last_seen_at', 'DESC']],
    limit,
  });

  return {
    rows: rows.map(row => {
      const plain = row.toJSON();
      return {
        id: plain.id,
        source: plain.source,
        maker: plain.maker,
        model: plain.model,
        grade: plain.grade,
        modelYear: plain.modelYear,
        mileageKm: plain.mileageKm,
        totalPrice: plain.totalPrice != null ? Number(plain.totalPrice) : null,
        prefecture: plain.prefecture,
        status: plain.status,
        thumbnail: Array.isArray(plain.photos) && plain.photos.length ? plain.photos[0] : null,
      };
    }),
    total: count,
  };
}

async function searchVehicles(term, limit) {
  const { rows, count } = await Vehicle.findAndCountAll({
    where: ilikeAny(VEHICLE_TEXT_COLUMNS, term),
    include: [
      { model: Media, as: 'images', through: { attributes: ['sort_order'] }, required: false },
    ],
    order: [['created_at', 'DESC']],
    limit,
    distinct: true,
  });

  return {
    rows: rows.map(row => {
      const plain = row.toJSON();
      const images = Array.isArray(plain.images)
        ? [...plain.images].sort(
            (a, b) => (a.VehicleMedia?.sort_order ?? 0) - (b.VehicleMedia?.sort_order ?? 0)
          )
        : [];
      return {
        id: plain.id,
        make: plain.make,
        model: plain.model,
        year: plain.year,
        price: plain.price,
        color: plain.color,
        status: plain.status,
        thumbnail: images[0]?.url ?? null,
      };
    }),
    total: count,
  };
}

// Unified global search across vehicles and crawler listings.
// GET /api/search?q=<term>&type=vehicles|listings|both&limit=<n>
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = ['vehicles', 'listings', 'both'].includes(req.query.type)
      ? req.query.type
      : 'both';
    const limit = Math.min(Number(req.query.limit) || 8, 25);

    const empty = { rows: [], total: 0 };
    if (term.length < 2) {
      return res.send({ q: term, type, vehicles: empty, listings: empty, limit });
    }

    const [vehicles, listings] = await Promise.all([
      type === 'listings' ? Promise.resolve(empty) : searchVehicles(term, limit),
      type === 'vehicles' ? Promise.resolve(empty) : searchListings(term, limit),
    ]);

    res.send({ q: term, type, vehicles, listings, limit });
  })
);

module.exports = router;

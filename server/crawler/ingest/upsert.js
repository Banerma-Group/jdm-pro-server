const { Listing, PriceHistory, sequelize } = require('../../../db/models');
const { canonicalMaker } = require('../lookup/maker');
const { debugLog } = require('../shared/debug');

const listingFields = [
  'source',
  'sourceListingId',
  'url',
  'maker',
  'model',
  'grade',
  'modelYear',
  'mileageKm',
  'displacementCc',
  'transmission',
  'fuelType',
  'bodyType',
  'drivetrain',
  'color',
  'doors',
  'seats',
  'inspectionUntil',
  'repairHistory',
  'totalPrice',
  'vehiclePrice',
  'prefecture',
  'dealerName',
  'photos',
  'descriptionOriginal',
  'raw',
];

function normalizeListing(canonical) {
  const out = {};
  for (const field of listingFields) {
    if (field in canonical) out[field] = canonical[field];
  }
  out.maker = canonicalMaker(out.maker);
  out.photos = Array.isArray(out.photos) ? out.photos.filter(Boolean) : [];
  return out;
}

function numberOrNull(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function upsertListing(canonical) {
  const listingData = normalizeListing(canonical);
  const { source, sourceListingId } = listingData;
  if (!source || !sourceListingId) throw new Error('Parsed listing is missing source/sourceListingId');

  debugLog('worker.ingest.upsert.request', {
    source,
    sourceListingId,
    maker: listingData.maker,
    model: listingData.model,
    totalPrice: listingData.totalPrice,
    photoCount: listingData.photos?.length || 0,
  });

  return sequelize.transaction(async transaction => {
    const existing = await Listing.findOne({
      where: { source, sourceListingId },
      transaction,
    });
    const newPrice = numberOrNull(listingData.totalPrice);

    if (!existing) {
      const listing = await Listing.create({ ...listingData, status: 'active' }, { transaction });
      if (newPrice != null) await PriceHistory.create({ listingId: listing.id, price: newPrice }, { transaction });
      debugLog('worker.ingest.upsert.inserted', { listingId: listing.id, source, sourceListingId, totalPrice: newPrice });
      return { listing, isNew: true, priceChanged: false };
    }

    const priceChanged = newPrice != null && numberOrNull(existing.totalPrice) !== newPrice;
    await existing.update(
      {
        ...listingData,
        status: 'active',
        consecutiveMisses: 0,
        lastSeenAt: new Date(),
      },
      { transaction }
    );

    if (priceChanged) await PriceHistory.create({ listingId: existing.id, price: newPrice }, { transaction });
    debugLog('worker.ingest.upsert.updated', {
      listingId: existing.id,
      source,
      sourceListingId,
      previousPrice: existing.totalPrice,
      newPrice,
      priceChanged,
    });

    return { listing: existing, isNew: false, priceChanged };
  });
}

module.exports = {
  normalizeListing,
  upsertListing,
};

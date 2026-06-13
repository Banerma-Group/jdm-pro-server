const crypto = require('crypto');
const { Listing, Vehicle, Media, VehicleMedia, sequelize } = require('../../db/models');

// Mirrors the dashboard's vehicle-form slug format ("make-model-<suffix>") so
// crawler-created vehicles get a public-website slug and the Telegram "View
// vehicle" button can deep-link to /<locale>/inventory/<slug>.
function vehicleSlug(make, model) {
  const base = `${make || ''}-${model || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomBytes(3).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}

function numberString(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function photoName(url, index) {
  try {
    const basename = new URL(url).pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(basename || `listing-photo-${index + 1}`);
  } catch {
    return `listing-photo-${index + 1}`;
  }
}

function vehicleAttrsFromListing(listing) {
  const row = typeof listing.toJSON === 'function' ? listing.toJSON() : listing;
  return {
    make: row.maker || null,
    model: row.model || null,
    mileage: numberString(row.mileageKm),
    color: row.color || null,
    transmission: row.transmission || null,
    price: numberString(row.totalPrice ?? row.vehiclePrice),
    year: row.modelYear || null,
    description: row.descriptionOriginal || null,
    status: 'available',
    locale: 'ja',
    isPosted: false,
    slug: vehicleSlug(row.maker, row.model),
    crawlerListingId: row.id,
  };
}

async function attachListingPhotos(vehicle, listing, { transaction } = {}) {
  const row = typeof listing.toJSON === 'function' ? listing.toJSON() : listing;
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
  if (!photos.length) return [];

  const seen = new Set();
  const mediaRows = [];

  for (const [index, url] of photos.entries()) {
    if (seen.has(url)) continue;
    seen.add(url);

    const media = await Media.create(
      {
        url,
        name: photoName(url, index),
      },
      { transaction }
    );

    mediaRows.push({
      vehicle_id: vehicle.id,
      media_id: media.id,
      sortOrder: mediaRows.length + 1,
      isCover: mediaRows.length === 0,
    });
  }

  if (mediaRows.length) {
    await VehicleMedia.bulkCreate(mediaRows, { transaction, ignoreDuplicates: true });
  }

  return mediaRows;
}

async function createVehicleFromListing(listingOrId, { transaction } = {}) {
  const run = async (t) => {
    const listing =
      typeof listingOrId === 'string'
        ? await Listing.findByPk(listingOrId, { transaction: t })
        : listingOrId;

    if (!listing) {
      const error = new Error('Listing not found');
      error.status = 404;
      throw error;
    }

    const listingId = typeof listing.toJSON === 'function' ? listing.id : listing.id;
    const [vehicle, created] = await Vehicle.findOrCreate({
      where: { crawlerListingId: listingId },
      defaults: vehicleAttrsFromListing(listing),
      transaction: t,
    });

    if (created) await attachListingPhotos(vehicle, listing, { transaction: t });
    return { vehicle, created };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

module.exports = {
  vehicleAttrsFromListing,
  attachListingPhotos,
  createVehicleFromListing,
};

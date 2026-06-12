function inRange(value, min, max) {
  if (value == null) return min == null && max == null;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function inSet(value, set) {
  if (!set || set.length === 0) return true;
  return value != null && set.includes(value);
}

function matchesCriteria(listing, criteria = {}) {
  if (criteria.maker && listing.maker !== criteria.maker) return false;
  if (!inSet(listing.model, criteria.models)) return false;
  if (!inRange(listing.totalPrice, criteria.priceMin, criteria.priceMax)) return false;
  if (!inRange(listing.modelYear, criteria.yearMin, criteria.yearMax)) return false;
  if (!inRange(listing.mileageKm, criteria.mileageMin, criteria.mileageMax)) return false;
  if (!inSet(listing.bodyType, criteria.bodyTypes)) return false;
  if (!inSet(listing.fuelType, criteria.fuelTypes)) return false;
  if (!inSet(listing.transmission, criteria.transmissions)) return false;
  if (!inSet(listing.prefecture, criteria.prefectures)) return false;
  return true;
}

module.exports = {
  matchesCriteria,
};

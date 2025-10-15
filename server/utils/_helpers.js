const { validationResult } = require('express-validator');

// Sizdagi async wrapper’ga o‘xshash soddalashtirilgan versiya:
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validatsiya xatolarini tekshirish
const runValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.status = 422;
    err.details = errors.array();
    throw err;
  }
};

// Pagination builder: ?page=1&pageSize=20
const buildPagination = (req) => {
  const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize ?? '20', 10), 1), 100);
  const offset = (page - 1) * pageSize;
  const limit = pageSize;
  return { page, pageSize, offset, limit };
};

// order/sort: ?sort=createdAt&order=desc
const buildOrder = (req, defaultSort = 'createdAt') => {
  const sort = req.query.sort || defaultSort;
  const order = (req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return [[sort, order]];
};

// helper: payloadni tozalash va through formatga keltirish
function buildThroughPayload(images = []) {
  // dublikatlarni olib tashlash + sort_order fallback
  const uniq = new Map();
  images.forEach((x, i) => {
    const id = Number(x.id);
    if (!id) return;
    if (!uniq.has(id)) {
      uniq.set(id, {
        id,
        VehicleMedia: { sort_order: Number(x.sort_order ?? i + 1) },
      });
    }
  });
  return Array.from(uniq.values());
}

module.exports = { asyncRoute, runValidation, buildPagination, buildOrder, buildThroughPayload };

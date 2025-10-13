// schema.js
const Joi = require('joi');

/** ---------- Helpers ---------- */
const Str = Joi.string().trim().allow(null, '');
const Bool = Joi.boolean().truthy('true').falsy('false').allow(null);
const Int = Joi.number().integer();

/** Phone: required (string "+"/digits 7–15 or non-negative integer) */
const Phone = Joi.alternatives()
  .try(
    Joi.string()
      .trim()
      .pattern(/^\+?[0-9]{7,15}$/),
    Int.min(0)
  )
  .required();

/** ---------- Shared attributes (kebab-case, JSON:API) ----------
 * Used by both create & update. Here, password and sms-token are OPTIONAL.
 * They are made REQUIRED only for create in attributesCreate.
 */
const attributesBase = Joi.object({
  'first-name': Str,
  'last-name': Str,
  phone: Phone, // required in both create & update
  password: Str, // optional here (required only in create)
  'has-password': Bool,
  'sms-token': Str, // optional here (required only in create)
  'telegram-id': Joi.alternatives().try(Int, Str).allow(null, ''),
  'telegram-username': Str,
  'load-search-limit': Int.min(0).allow(null),
  'vehicle-search-limit': Int.min(0).allow(null),
  'new-loads-notifier-enabled': Bool,
  role: Joi.alternatives().try(Str, Int).allow(null, ''),
}).unknown(true);

/** Create attributes: same as base but password & sms-token are REQUIRED */
const attributesCreate = attributesBase.keys({
  password: Joi.string().trim().min(1).required(),
  'sms-token': Joi.string().trim().min(1).required(),
});

/** Update attributes: same as base (password & sms-token optional) */
const attributesUpdate = attributesBase;

/** ---------- Schemas ---------- */

/** Create user (JSON:API) */
const createUserSchema = Joi.object({
  data: Joi.object({
    type: Joi.string().valid('users').required(),
    attributes: attributesCreate.required(),
  }).required(),
}).required();

/** Update details (JSON:API) — includes id and supports extra arrays */
const updateDetailsAttributes = attributesUpdate.keys({
  'bookmarked-load-ids': Joi.array().items(Joi.alternatives().try(Int, Str)).allow(null),
  'bookmarked-vehicle-ids': Joi.array().items(Joi.alternatives().try(Int, Str)).allow(null),
  'marked-expired-loads': Joi.array().items(Joi.alternatives().try(Int, Str)).allow(null),
  'marked-invalid-vehicles': Joi.array().items(Joi.alternatives().try(Int, Str)).allow(null),
});

/** Update user (JSON:API) — allow data.id */
const updateUserSchema = Joi.object({
  data: Joi.object({
    id: Joi.alternatives().try(Str, Int), // <-- allow id in PATCH body
    type: Joi.string().valid('users').required(),
    attributes: updateDetailsAttributes.required(),
  })
    .unknown(true) // allow JSON:API extras like meta/relationships if present
    .required(),
}).required();

const updateDetailsSchema = Joi.object({
  phone: Phone,
  password: Str,
  role: Str,
  firstName: Str,
  lastName: Str,
}).unknown(false);

/** Change password — new must differ from current */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  password: Joi.string().invalid(Joi.ref('currentPassword')).required(),
}).unknown(false);

module.exports = {
  createUserSchema,
  updateUserSchema,
  updateDetailsSchema,
  changePasswordSchema,
};

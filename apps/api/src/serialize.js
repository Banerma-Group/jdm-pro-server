import pkg from "jsonapi-serializer";
import camelize from "camelize";
import isEqual from "lodash/isEqual.js";
import uniqWith from "lodash/uniqWith.js";

const { Serializer, Deserializer, Error: JSONAPIError } = pkg;

const RELATION_NAME_TRANSLATION = {
  owner: "user",
};

// Drizzle rows are plain objects with camelCase keys (no Sequelize toJSON /
// _options). This handles both snake_case (`user_id`) and camelCase (`userId`)
// foreign keys so the JSON:API relationship output matches the old Sequelize one.
function relationTransform(record) {
  if (!record) return null;
  const json = record.toJSON ? record.toJSON() : record;

  const res = {};
  for (const originalKey of Object.keys(json)) {
    let value = json[originalKey];
    const snakeRel = originalKey.endsWith("_id");
    const camelRel = /[a-z]Id$/.test(originalKey) && originalKey !== "id";
    const isRelation = snakeRel || camelRel;

    let key = originalKey;
    if (snakeRel) key = originalKey.slice(0, -3);
    else if (camelRel) key = originalKey.slice(0, -2);

    const isIncluded = key in RELATION_NAME_TRANSLATION;
    if (value !== null && value !== undefined) {
      if (isIncluded) {
        value = { id: value.id, type: RELATION_NAME_TRANSLATION[key] };
      } else if (isRelation) {
        value = { id: value, type: RELATION_NAME_TRANSLATION[key] || key };
      }
    }
    res[camelize(key)] = value;
  }
  return res;
}

function typeForAttribute(attribute, record) {
  return record && "type" in record ? record.type : attribute;
}

const meta = {
  pagination(records) {
    return records.pagination;
  },
};

const User = new Serializer("users", {
  attributes: ["firstName", "lastName", "email", "role", "media"],
  media: { ref: "id" },
  typeForAttribute,
  transform: relationTransform,
  meta,
});

const Media = new Serializer("media", {
  attributes: ["url", "name", "user"],
  user: { ref: "id" },
  typeForAttribute,
  transform: relationTransform,
  meta,
});

const Vehicle = new Serializer("vehicles", {
  attributes: [
    "make", "model", "notes", "mileage", "color", "slug", "stockNumber", "status", "vin",
    "transmission", "youtubeLink", "description", "price", "isPosted", "year",
    "publishedAt", "locale", "createdBy", "updatedBy",
  ],
  youtubeCover: { ref: "id" },
  createdBy: { ref: "id" },
  updatedBy: { ref: "id" },
  typeForAttribute,
  transform: relationTransform,
  meta,
});

const PurchasingProcess = new Serializer("purchasing-processes", {
  attributes: ["title", "slug", "description", "introduction", "publishedAt", "locale", "createdBy", "updatedBy"],
  createdBy: { ref: "id" },
  updatedBy: { ref: "id" },
  typeForAttribute,
  transform: relationTransform,
  meta,
});

const Service = new Serializer("services", {
  attributes: ["title", "description", "icon", "slug", "publishedAt", "locale", "createdBy", "updatedBy"],
  createdBy: { ref: "id" },
  updatedBy: { ref: "id" },
  typeForAttribute,
  transform: relationTransform,
  meta,
});

const serializers = { User, Vehicle, Media, PurchasingProcess, Service };

const DefaultDeserializer = new Deserializer({ keyForAttribute: "camelCase" });

export function deserialize(models) {
  return DefaultDeserializer.deserialize(models);
}

// Drizzle rows have no constructor model name, so callers pass { type } explicitly.
export function serialize(models, { type } = {}) {
  const isArray = Array.isArray(models);
  const model = isArray ? models[0] : models;
  const key = camelize(type || model?.constructor?.name || "");
  const serializer = serializers[key];
  return serializer ? serializer.serialize(models) : { data: models };
}

export { JSONAPIError };

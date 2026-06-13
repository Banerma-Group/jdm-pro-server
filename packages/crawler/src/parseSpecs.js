import { normalize, translateField } from "@jdm-pro/lookup";

const specLabels = {
  メーカー: "maker",
  車名: "model",
  グレード: "grade",
  年式: "modelYear",
  走行距離: "mileageKm",
  排気量: "displacementCc",
  ミッション: "transmission",
  シフト: "transmission",
  燃料: "fuelType",
  ボディタイプ: "bodyType",
  ボディカラー: "color",
  車体色: "color",
  駆動方式: "drivetrain",
  ドア数: "doors",
  乗車定員: "seats",
  車検: "inspectionUntil",
  修復歴: "repairHistory",
  支払総額: "totalPrice",
  車両本体価格: "vehiclePrice",
  本体価格: "vehiclePrice",
  地域: "prefecture",
  所在地: "prefecture",
};

const numericFields = {
  modelYear: normalize.parseYear,
  mileageKm: normalize.parseMileageKm,
  displacementCc: normalize.parseInt0,
  doors: normalize.parseInt0,
  seats: normalize.parseInt0,
  totalPrice: normalize.parseYen,
  vehiclePrice: normalize.parseYen,
};

const translatedFields = ["maker", "model", "grade", "color", "transmission", "fuelType", "bodyType", "drivetrain", "prefecture"];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRepairHistory(value) {
  if (value == null) return null;
  return !/なし|無/.test(String(value));
}

export async function specMapToCanonical(specMap, deps = {}) {
  const out = {};
  for (const [label, rawValue] of Object.entries(specMap)) {
    const field = specLabels[String(label).trim()];
    if (!field || out[field] != null) continue;
    if (numericFields[field]) out[field] = numericFields[field](rawValue);
    else if (field === "repairHistory") out[field] = parseRepairHistory(rawValue);
    else if (field === "inspectionUntil") out[field] = normalizeText(rawValue);
    else if (translatedFields.includes(field)) out[field] = await translateField(field, rawValue, deps);
    else out[field] = normalizeText(rawValue);
  }
  return out;
}

export function dedupeById(refs) {
  const seen = new Set();
  return refs.filter((ref) => (seen.has(ref.sourceListingId) ? false : seen.add(ref.sourceListingId)));
}

import { specMapToCanonical, dedupeById } from "../parseSpecs.js";

const makerToBrandCode = {
  toyota: "TO",
  honda: "HO",
  nissan: "NI",
  mazda: "MA",
  subaru: "SB",
  suzuki: "SZ",
  daihatsu: "DA",
  mitsubishi: "MI",
  lexus: "LE",
  "mercedes-benz": "ME",
  bmw: "BM",
  audi: "AD",
  volkswagen: "VW",
};

function listingIdFromUrl(url) {
  const match = String(url).match(/\/usedcar\/detail\/([A-Za-z0-9]+)\//);
  return match ? match[1] : null;
}

function toAbsolute(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.carsensor.net${href}`;
}

function text(el) {
  return el?.textContent?.trim().replace(/\s+/g, " ") || "";
}

function normaliseThKey(raw) {
  return String(raw)
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function remapLabel(key) {
  return (
    {
      色: "車体色",
      エンジン種別: "燃料",
    }[key] || key
  );
}

function makerModelFromTitle(doc) {
  const h1 = doc.querySelector("h1.title1");
  if (!h1) return { maker: null, model: null };

  let lead = "";
  for (const node of h1.childNodes) {
    if (node.nodeType === 1) break;
    lead += node.textContent;
  }

  const tokens = lead.trim().split(/[\s　]+/).filter(Boolean);
  return { maker: tokens[0] || null, model: tokens[1] || null };
}

function detectFromUrl(url) {
  try {
    return new URL(url).hostname.includes("carsensor.net");
  } catch {
    return false;
  }
}

function buildSearchUrl(criteria = {}) {
  const base = "https://www.carsensor.net/usedcar/search.php";
  const params = new URLSearchParams();
  if (criteria.maker) {
    const maker = String(criteria.maker).trim().toLowerCase();
    params.set("BRDC", makerToBrandCode[maker] || String(criteria.maker).toUpperCase());
  }
  // CarSensor price params are in man-yen (¥10,000) units.
  if (criteria.priceMin) params.set("PRICELOW", String(Math.round(criteria.priceMin / 10000)));
  if (criteria.priceMax) params.set("PRICEHIGH", String(Math.round(criteria.priceMax / 10000)));

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function parseSearchPage(doc) {
  const raw = Array.from(doc.querySelectorAll('a[href*="/usedcar/detail/"]'))
    .map((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href.includes("#")) return null;
      const sourceListingId = listingIdFromUrl(href);
      if (!sourceListingId) return null;
      return { sourceListingId, url: toAbsolute(href) };
    })
    .filter(Boolean);

  let nextPageUrl = toAbsolute(doc.querySelector('link[rel="next"]')?.getAttribute("href"));
  if (!nextPageUrl) {
    const onclick = doc.querySelector(".pager__btn__next")?.getAttribute("onclick") || "";
    nextPageUrl = toAbsolute(onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1]);
  }

  return {
    listingRefs: dedupeById(raw),
    nextPageUrl,
  };
}

function parseMakerOptions(doc) {
  return Array.from(doc.querySelectorAll(".modalMaker__maker .js_makerMenu"))
    .map((anchor) => {
      const label = anchor.getAttribute("title")?.trim() || anchor.textContent.replace(/\([^)]*\)/g, "").trim();
      const onclick = anchor.getAttribute("onclick") || anchor.getAttribute("onClick") || "";
      const code = onclick.match(/clickBrand\('([^']*)'/)?.[1] || "";
      if (!label || !code || label === "こだわらない") return null;
      return { site: "carsensor", code, label };
    })
    .filter(Boolean);
}

function parseSummaryBoxes(doc, specMap) {
  const titleToLabel = {
    年式: "年式",
    走行距離: "走行距離",
    修復歴: "修復歴",
    車検有無: "車検",
    地域: "地域",
  };

  for (const box of doc.querySelectorAll(".specWrap__box")) {
    const label = titleToLabel[text(box.querySelector(".specWrap__box__title"))];
    if (!label) continue;

    const num = text(box.querySelector(".specWrap__box__num"));
    const unit = text(box.querySelector(".specWrap__boxUnit"));
    const value = num
      ? `${num}${unit}`
      : Array.from(box.querySelectorAll(".specWrap__boxDetail")).map(text).join(" ").trim();

    if (value && !specMap[label]) specMap[label] = value;
  }
}

function parsePrices(doc, specMap) {
  const totalPrice = text(doc.querySelector(".totalPrice__price")).replace(/\s+/g, "");
  if (totalPrice) specMap.支払総額 = totalPrice;

  const basePriceEl = doc.querySelector(".basePrice__price");
  const contentPrice = basePriceEl?.getAttribute("content");
  const basePrice = contentPrice ? `${contentPrice.replace(/,/g, "")}円` : text(basePriceEl).replace(/\s+/g, "");
  if (basePrice) specMap.車両本体価格 = basePrice;
}

function parseSpecTables(doc, specMap) {
  for (const table of doc.querySelectorAll("table.defaultTable__table")) {
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = Array.from(row.children);
      for (let i = 0; i < cells.length; i += 1) {
        if (cells[i].tagName?.toLowerCase() !== "th") continue;
        const key = remapLabel(normaliseThKey(text(cells[i])));
        const valueCell = cells[i + 1];
        const value = valueCell?.tagName?.toLowerCase() === "td" ? text(valueCell) : "";
        if (key && value && value !== "－" && value !== "-" && !specMap[key]) specMap[key] = value;
      }
    }
  }
}

function parsePhotos(doc) {
  const photos = new Set();
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage && ogImage.includes("carsensor.net")) photos.add(ogImage);

  for (const anchor of doc.querySelectorAll(".js-photo[data-photo]")) {
    const src = anchor.getAttribute("data-photohq") || anchor.getAttribute("data-photo");
    if (!src || src.startsWith("/cmn/") || src.startsWith("/help/")) continue;
    if (src.includes("carsensor.net") || src.startsWith("https://ccsrpc")) photos.add(src.split("?")[0]);
  }

  const mainPhoto = doc.querySelector("#js-mainPhoto");
  const mainSrc = mainPhoto?.getAttribute("data-photo") || mainPhoto?.getAttribute("src");
  if (mainSrc && (mainSrc.includes("carsensor.net") || mainSrc.startsWith("https://ccsrpc"))) photos.add(mainSrc.split("?")[0]);

  return Array.from(photos);
}

async function parseListingPage(doc, url, deps) {
  const sourceListingId = listingIdFromUrl(url);
  const specMap = {};

  parseSummaryBoxes(doc, specMap);
  parsePrices(doc, specMap);
  parseSpecTables(doc, specMap);

  const { maker, model } = makerModelFromTitle(doc);
  if (maker && !specMap.メーカー) specMap.メーカー = maker;
  if (model && !specMap.車名) specMap.車名 = model;

  return {
    source: "carsensor",
    sourceListingId,
    url,
    ...(await specMapToCanonical(specMap, deps)),
    photos: parsePhotos(doc),
    descriptionOriginal: text(doc.querySelector(".shopComment")) || null,
    raw: { specMap },
  };
}

export default {
  site: "carsensor",
  makerListUrl: "https://www.carsensor.net/usedcar/search.php",
  detectFromUrl,
  buildSearchUrl,
  parseMakerOptions,
  parseSearchPage,
  parseListingPage,
};

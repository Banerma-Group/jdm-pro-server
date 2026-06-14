import { specMapToCanonical, dedupeById } from "../parseSpecs.js";

function carIdFromUrl(url) {
  const match = String(url).match(/\/usedcar\/spread\/goo\/\d+\/(\d+)\.html/);
  return match ? match[1] : null;
}

function toAbsolute(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.goo-net.com${href}`;
}

function text(el) {
  return el?.textContent?.trim().replace(/\s+/g, " ") || "";
}

function makerModelFromTitle(doc) {
  const h1 = doc.querySelector("h1.copy");
  let lead = h1 ? h1.textContent : null;
  if (!lead) lead = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  if (!lead) return { maker: null, model: null };

  const tokens = lead.trim().split(/[\s　]+/).filter(Boolean);
  return { maker: tokens[0] || null, model: tokens[1] || null };
}

function detectFromUrl(url) {
  try {
    return new URL(url).hostname.includes("goo-net.com");
  } catch {
    return false;
  }
}

function buildSearchUrl(criteria = {}) {
  const slug = criteria.maker
    ? String(criteria.maker)
        .toUpperCase()
        .replace(/[^A-Z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

  return slug ? `https://www.goo-net.com/usedcar/brand-${slug}/list/` : "https://www.goo-net.com/usedcar/all/list/";
}

function parseSearchPage(doc) {
  const raw = Array.from(doc.querySelectorAll('a[href*="/usedcar/spread/"]'))
    .map((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href.includes("#")) return null;
      const sourceListingId = carIdFromUrl(href);
      if (!sourceListingId) return null;
      return { sourceListingId, url: toAbsolute(href) };
    })
    .filter(Boolean);

  const relNext = doc.querySelector('link[rel="next"]');
  const nextLink = relNext || doc.querySelector("li.next a");

  return {
    listingRefs: dedupeById(raw),
    nextPageUrl: toAbsolute(nextLink?.getAttribute("href")),
  };
}

function parseMakerOptions(doc) {
  const makers = new Map();

  for (const anchor of doc.querySelectorAll('a[href*="/usedcar/brand-"]')) {
    const href = anchor.getAttribute("href") || "";
    const code = href.match(/\/usedcar\/brand-([^/]+)\/?(?:$|[?#])/)?.[1];
    if (!code || code.includes("top")) continue;

    const label = anchor.textContent
      .replace(/の中古車/g, "")
      .replace(/\([^)]*\)/g, "")
      .trim();
    if (!label || /^[A-Z0-9-]+$/.test(label)) continue;

    makers.set(code, { site: "goonet", code, label });
  }

  return Array.from(makers.values());
}

function parsePriceBlocks(doc, specMap) {
  for (const block of doc.querySelectorAll(".mainDataList")) {
    const labelRaw = text(block.querySelector(".txt")).replace(/\s+/g, "");
    const label = labelRaw.replace(/（.*?）|\(.*?\)/g, "").trim();
    const value = text(block.querySelector(".num")).replace(/\s+/g, "");
    if (label && value && !specMap[label]) specMap[label] = value;
  }
}

function parseSpecTables(doc, specMap) {
  for (const table of doc.querySelectorAll("table.tbl_type01:not(.catalog_tbl)")) {
    for (const row of table.querySelectorAll("tr")) {
      const ths = row.querySelectorAll("th");
      const tds = row.querySelectorAll("td");
      for (let i = 0; i < ths.length && i < tds.length; i += 1) {
        const key = text(ths[i]).replace(/\s+/g, "");
        const value = text(tds[i]);
        if (key && value && value !== "－" && value !== "-" && !specMap[key]) specMap[key] = value;
      }
    }
  }
}

function parseSummary(doc, specMap) {
  const classToLabel = {
    mode: "年式",
    mile: "走行距離",
    vehi: "車検",
    repa: "修復歴",
    engi: "排気量",
    color: "車体色",
  };

  for (const [className, label] of Object.entries(classToLabel)) {
    const li = doc.querySelector(`ul.subData li.${className}`);
    if (!li) continue;
    const spans = li.querySelectorAll("span");
    const value = text(spans[1] || spans[0]);
    if (value) specMap[label] = value;
  }
}

function parsePhotos(doc) {
  const photos = new Set();
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage && ogImage.includes("picture1.goo-net.com")) photos.add(ogImage);

  for (const img of doc.querySelectorAll("#photoGalleryTop .item.image img")) {
    const src = img.getAttribute("data-lazy") || img.getAttribute("src");
    if (src && src.includes("picture1.goo-net.com")) photos.add(src);
  }

  for (const img of doc.querySelectorAll(".slick-thumb img")) {
    const src = img.getAttribute("src");
    if (src && src.includes("picture1.goo-net.com")) photos.add(src);
  }

  return Array.from(photos);
}

async function parseListingPage(doc, url, deps) {
  const sourceListingId = carIdFromUrl(url);
  const specMap = {};

  parseSummary(doc, specMap);
  parsePriceBlocks(doc, specMap);
  parseSpecTables(doc, specMap);

  const { maker, model } = makerModelFromTitle(doc);
  if (maker && !specMap.メーカー) specMap.メーカー = maker;
  if (model && !specMap.車名) specMap.車名 = model;

  return {
    source: "goonet",
    sourceListingId,
    url,
    ...(await specMapToCanonical(specMap, deps)),
    photos: parsePhotos(doc),
    descriptionOriginal: text(doc.querySelector(".prBlock p")) || null,
    raw: { specMap },
  };
}

export default {
  site: "goonet",
  makerListUrl: "https://www.goo-net.com/usedcar/brand-top.html",
  makerListCharset: "euc-jp",
  detectFromUrl,
  buildSearchUrl,
  parseMakerOptions,
  parseSearchPage,
  parseListingPage,
};

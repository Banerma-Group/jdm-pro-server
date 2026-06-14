import { parseHtml } from "./dom.js";
import { debugLog } from "@jdm-pro/shared";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { launch, ensureBinary } = await import("cloakbrowser");
      await ensureBinary();
      return launch({ headless: true });
    })();
  }
  return browserPromise;
}

function charsetFromContentType(contentType) {
  return contentType?.match(/charset=([^;]+)/i)?.[1]?.trim() || null;
}

async function responseText(response, fallbackCharset) {
  const contentType = response.headers?.get?.("content-type");
  const charset = charsetFromContentType(contentType) || fallbackCharset || "utf-8";
  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function fetchHttpDocument(url, { charset, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.8,en;q=0.6",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status} ${response.statusText}) for ${url}`);
  }

  const html = await responseText(response, charset);
  return parseHtml(html);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDocument(url, { charset, waitFor, fetchImpl = fetch } = {}) {
  if (process.env.CRAWLER_FETCH_MODE === "http") {
    return fetchHttpDocument(url, { charset, fetchImpl });
  }

  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await delay(1000 + Math.random() * 2000);
    debugLog("crawler.browser.fetch.start", { url, waitFor });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
    const html = await page.content();
    debugLog("crawler.browser.fetch.done", { url, waitFor, htmlLength: html.length });
    return parseHtml(html);
  } finally {
    await context.close();
    debugLog("crawler.browser.context.closed", { url });
  }
}

export { fetchHttpDocument };

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

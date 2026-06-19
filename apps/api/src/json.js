// Approximation of helmet's default hardening for the Bun.serve responses.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "Referrer-Policy": "no-referrer",
};

const MAX_BODY_BYTES = 200 * 1024; // mirrors express.json limit: "200kb"

export function json(data, status = 200, extraHeaders = {}) {
  const payload = data === undefined ? "" : JSON.stringify(data);
  return new Response(payload, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extraHeaders },
  });
}

export function text(value, status = 200, extraHeaders = {}) {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS, ...extraHeaders },
  });
}

// Parse + validate a JSON request body (mirrors express.json strict + 200kb).
export async function body(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) {
    const err = new Error("Payload too large");
    err.status = 413;
    throw err;
  }
  const raw = await request.text();
  if (!raw) return {};
  const contentType = request.headers.get("content-type") || "";
  if (raw.length > MAX_BODY_BYTES) {
    const err = new Error("Payload too large");
    err.status = 413;
    throw err;
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      const err = new Error("Invalid JSON body");
      err.status = 400;
      throw err;
    }
    return parsed;
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "0.0.0.0";
}

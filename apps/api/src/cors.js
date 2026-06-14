const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8080",
  "https://jdm-pro-dashboard.vercel.app",
  "https://jdm-pro.com",
  "https://jdm-pro-server.onrender.com",
];

const ALLOWED_HEADERS = [
  "X-Requested-With",
  "X-HTTP-Method-Override",
  "Content-Type",
  "Accept",
  "Cookie",
  "Authorization",
  "user-locale",
  "Idempotency-Key",
  "X-Device-Id",
  "X-Device-Platform",
].join(", ");

const METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  return allowedOrigins.some((allowed) => {
    if (origin === allowed) return true;
    const bare = allowed.replace(/^https?:\/\//, "");
    return origin.includes("." + bare);
  });
}

// Headers added to EVERY response by the server entry (single place).
export function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const headers = {};
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function preflight(request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Allow-Methods": METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": "600",
    },
  });
}

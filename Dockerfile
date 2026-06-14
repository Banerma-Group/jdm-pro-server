# Build for linux/amd64: the CloakBrowser stealth Chromium has NO linux/arm64
# build. On Apple Silicon:  docker build --platform=linux/amd64 -t jdm-pro-server .
FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/crawler/package.json ./packages/crawler/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/lookup/package.json ./packages/lookup/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14 AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Runtime libraries + fonts required by the CloakBrowser stealth Chromium.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3 \
    libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libx11-xcb1 \
    libfontconfig1 libx11-6 libxcb1 libxext6 libxshmfence1 libglib2.0-0 \
    libgtk-3-0 libpangocairo-1.0-0 libcairo-gobject2 libgdk-pixbuf-2.0-0 \
    libxss1 libxtst6 \
    fonts-liberation fonts-noto-color-emoji fonts-unifont fonts-freefont-ttf \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Deterministic, user-independent cache path for the stealth Chromium binary.
ENV CLOAKBROWSER_CACHE_DIR=/app/.cloakbrowser

# Bun keeps workspace dependency links in the importing workspace's node_modules.
# Copy the root store plus each runtime workspace's resolving symlinks so source
# under apps/* and packages/* can resolve its @jdm-pro/* + package-local deps.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/crawler/node_modules ./packages/crawler/node_modules
COPY --from=deps /app/packages/lookup/node_modules ./packages/lookup/node_modules

# Pre-download the ~200MB stealth Chromium at build time so containers start
# instantly. Kept before the source COPY so this heavy layer stays cached across
# application code changes. Run from apps/api, where cloakbrowser resolves.
RUN cd apps/api && bun -e "const { ensureBinary } = await import('cloakbrowser'); await ensureBinary();"

COPY . .

EXPOSE 3000

# Default command runs the API (web service). The worker + migration Render
# services override the Docker Command with bun apps/worker/src/index.js and
# bun run db:migrate respectively.
CMD ["bun", "apps/api/src/index.js"]

# ── Stage 1: bundle Remotion ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS bundler

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY tsconfig.json remotion.config.ts ./
COPY src/ ./src/
COPY public/ ./public/

# Pre-bundle the Remotion composition at build time (slow once, fast at render)
# Note: Remotion 4.x outputs to ./build regardless of --output flag
RUN npx remotion bundle src/index.ts

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM node:20-bookworm-slim

# Chromium + font dependencies required by @remotion/renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only install production dependencies in the runtime stage
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --prefer-offline

# Copy pre-built bundle (Remotion 4.x outputs to ./build) and server
COPY --from=bundler /app/build ./build
COPY server.js ./

EXPOSE 8080

ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Cloud Run sets PORT automatically; default to 8080
ENV PORT=8080

CMD ["node", "server.js"]

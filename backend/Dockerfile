# Portable backend image — runs the SAME app identically on an Oracle Cloud
# Always Free VM (docker run), or any other host.
# Nothing host-specific lives here; all differences are environment variables.
FROM node:20-alpine

WORKDIR /app

# Chromium + fonts for the headless-browser renderer that screenshots the real
# quiz card into a pixel-identical Facebook/Instagram image (see
# src/config/cardShot.js). puppeteer-core uses this system Chromium (no bundled
# download). If this render ever fails, the app falls back to the lightweight
# SVG card, so posting never breaks.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto \
    && rm -rf /var/cache/apk/*
# puppeteer-core points here; the app also falls back to common paths.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
# The app reads PORT from the environment (defaults to 5000). On a VM you can
# leave it at 5000 and put Nginx in front; a PaaS may inject its own PORT.
EXPOSE 5000

CMD ["node", "src/server.js"]

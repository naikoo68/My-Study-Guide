# Portable backend image — runs the SAME app identically on an Oracle Cloud
# Always Free VM (docker run), or any other host.
# Nothing host-specific lives here; all differences are environment variables.
FROM node:20-alpine

WORKDIR /app

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

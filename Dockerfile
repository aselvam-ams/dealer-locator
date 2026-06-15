# Dealer Locator 2025 — single application image.
# The Fastify API also serves the built React app (same origin), so one
# container hosts the whole front+back end. It needs a PostgreSQL+PostGIS
# database (see docker-compose.prod.yml, or point DATABASE_URL at a managed DB).

# ---- build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install workspace deps using only manifests first (better layer caching).
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install

# Copy the rest of the source and build the web app for same-origin API calls.
COPY . .
ENV VITE_API_BASE=""
RUN npm run build -w web

# ---- runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_WEB=true \
    WEB_DIST=/app/web/dist \
    SFTP_OUT_DIR=/app/sftp-out

# Bring over installed deps, source (run via tsx), and the built web assets.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/sftp-out

EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]

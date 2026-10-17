# Vereinsdeckel als Docker-Abbild (NAS, Raspberry Pi, eigener Server).
# Daten (eingebaute Datenbank, Geheimschlüssel) liegen im Volume /data.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Berlin
RUN apk add --no-cache tzdata \
 && addgroup -S vereinsdeckel && adduser -S vereinsdeckel -G vereinsdeckel \
 && mkdir -p /data && chown vereinsdeckel:vereinsdeckel /data
COPY --from=build --chown=vereinsdeckel:vereinsdeckel /app/.next/standalone ./
COPY --from=build --chown=vereinsdeckel:vereinsdeckel /app/.next/static ./.next/static
COPY --from=build --chown=vereinsdeckel:vereinsdeckel /app/public ./public
COPY --from=build --chown=vereinsdeckel:vereinsdeckel /app/src/db/migrations ./src/db/migrations
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER vereinsdeckel
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

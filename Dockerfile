FROM node:24-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY vite.config.js index.html ./
RUN npm run build

FROM caddy:2-alpine AS web
COPY --from=frontend /build/dist/build/h5 /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:24-alpine AS api
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev --ignore-scripts
COPY backend/*.mjs ./backend/
COPY src/lib/domain.mjs ./src/lib/domain.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8787 RADAR_DB_PATH=/app/data/radar.sqlite
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.mjs"]

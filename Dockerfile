# Multi-stage build: one small production image with the API and the
# built React app. Build tools and dev dependencies never reach it.

# ---- 1. Build the React app ----
FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. Build the API ----
FROM node:22-bookworm-slim AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- 3. Runtime ----
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4100 \
    WEB_DIST=/app/web/dist \
    STORAGE_DIR=/app/storage
WORKDIR /app/server
COPY --from=server-build /app/server/package.json ./
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/dist ./dist
COPY --from=web-build /app/web/dist /app/web/dist
RUN mkdir -p /app/storage && chown node:node /app/storage

USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, optionally load demo data, then start API + job worker.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then node dist/seed.js; fi && exec node dist/index.js"]

# Killer Queen exchange (prompt 3.6). One container, one journal on a persistent volume.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY runner/agents.json ./runner/agents.json
RUN npm run build:web

FROM node:22-slim
ENV NODE_ENV=production \
    KQ_MODE=sandbox \
    DB_PATH=/data/killer-queen.db \
    PORT=3000 \
    LOG_FORMAT=json
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home kq && mkdir -p /data && chown kq:kq /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY runner/agents.json ./runner/agents.json
USER kq
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--import", "tsx", "src/server/main.ts"]

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/production ./production
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /var/data && chown node:node /var/data
ENV NODE_ENV=production DATA_DIR=/var/data PORT=10000
EXPOSE 10000
ENTRYPOINT ["sh","production/entrypoint.sh"]

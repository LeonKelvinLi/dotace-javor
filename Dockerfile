FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/var/data PORT=10000
EXPOSE 10000
CMD ["node","render/server.mjs"]

FROM node:20-slim

WORKDIR /app
ARG INSTALL_DEV_DEPS=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN if [ "$INSTALL_DEV_DEPS" = "1" ]; then npm ci --include=dev; else npm ci --omit=dev; fi

COPY . .

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 8787
CMD ["node", "index.js"]

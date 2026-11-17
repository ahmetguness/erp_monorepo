# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app/apps/backend
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

FROM base AS deps
COPY packages/types /app/packages/types
COPY package.json package-lock.json /app/
COPY apps/backend/package.json ./
RUN cd /app && npm ci --workspace=apps/backend --ignore-scripts \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/backend/node_modules/zod /app/node_modules/zod \
  && PATH=/app/apps/backend/node_modules/.bin:$PATH npm --prefix /app/packages/types run build

FROM deps AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY apps/backend ./
ARG RELEASE_VERSION=development
ARG RELEASE_GIT_SHA=development
ENV RELEASE_VERSION=$RELEASE_VERSION RELEASE_GIT_SHA=$RELEASE_GIT_SHA
LABEL org.opencontainers.image.version=$RELEASE_VERSION org.opencontainers.image.revision=$RELEASE_GIT_SHA
RUN npm run db:generate
RUN npm run build

FROM builder AS migrator
CMD ["node", "dist/scripts/deploy/migrate.js"]

FROM base AS runner
ENV NODE_ENV=production
ARG RELEASE_VERSION=development
ARG RELEASE_GIT_SHA=development
ENV RELEASE_VERSION=$RELEASE_VERSION RELEASE_GIT_SHA=$RELEASE_GIT_SHA
LABEL org.opencontainers.image.version=$RELEASE_VERSION org.opencontainers.image.revision=$RELEASE_GIT_SHA
COPY --from=builder /app/packages/types /app/packages/types
COPY package.json package-lock.json /app/
COPY apps/backend/package.json ./
RUN cd /app && npm ci --workspace=apps/backend --omit=dev --ignore-scripts \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/backend/node_modules/zod /app/node_modules/zod \
  && npm cache clean --force \
  && rm -rf /app/node_modules/deepmerge-ts /app/apps/backend/node_modules/deepmerge-ts /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder /app/apps/backend/dist/src ./dist/src
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
USER node
EXPOSE 3001
CMD ["node", "dist/src/index.js"]

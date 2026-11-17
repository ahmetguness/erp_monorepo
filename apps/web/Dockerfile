# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app/apps/web
COPY packages/types /app/packages/types
COPY package.json package-lock.json /app/
COPY apps/web/package.json ./
RUN cd /app && npm ci --workspace=apps/web --ignore-scripts \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/web/node_modules/zod /app/node_modules/zod \
  && PATH=/app/apps/web/node_modules/.bin:$PATH npm --prefix /app/packages/types run build

FROM deps AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /app/apps/web
COPY apps/web ./
COPY packages/types /app/packages/types
ARG NEXT_PUBLIC_API_URL=
ARG RELEASE_GIT_SHA=development
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV RELEASE_GIT_SHA=$RELEASE_GIT_SHA
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ARG RELEASE_VERSION=development
ARG RELEASE_GIT_SHA=development
ENV RELEASE_VERSION=$RELEASE_VERSION RELEASE_GIT_SHA=$RELEASE_GIT_SHA
LABEL org.opencontainers.image.version=$RELEASE_VERSION org.opencontainers.image.revision=$RELEASE_GIT_SHA
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p apps/web/.next/cache && chown -R node:node /app \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

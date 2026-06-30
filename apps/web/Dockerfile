# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app/apps/web
COPY packages/types /app/packages/types
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app/apps/web
COPY apps/web ./
COPY packages/types /app/packages/types
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p apps/web/.next/cache && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]


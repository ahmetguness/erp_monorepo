# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app/apps/backend
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

FROM base AS deps
COPY packages/types /app/packages/types
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/backend/node_modules/zod /app/node_modules/zod

FROM deps AS builder
COPY packages/types /app/packages/types
COPY apps/backend ./
RUN npm run db:generate
RUN npm run build

FROM deps AS migrator
COPY packages/types /app/packages/types
COPY apps/backend ./
RUN npm run db:generate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production
COPY packages/types /app/packages/types
COPY apps/backend/package.json apps/backend/package-lock.json ./
COPY apps/backend/prisma ./prisma
RUN npm ci --omit=dev \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/backend/node_modules/zod /app/node_modules/zod \
  && npm cache clean --force
COPY --from=builder /app/apps/backend/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/src/index.js"]

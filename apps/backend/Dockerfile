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
COPY apps/backend ./
RUN npm run db:generate
RUN npm run build

FROM deps AS migrator
COPY apps/backend ./
RUN npm run db:generate \
  && ln -sf schema/migrations prisma/migrations
CMD ["npx", "prisma", "migrate", "deploy", "--schema=prisma/schema"]

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/packages/types /app/packages/types
COPY package.json package-lock.json /app/
COPY apps/backend/package.json ./
COPY apps/backend/prisma ./prisma
RUN cd /app && npm ci --workspace=apps/backend --omit=dev --ignore-scripts \
  && mkdir -p /app/node_modules \
  && ln -s /app/apps/backend/node_modules/zod /app/node_modules/zod \
  && npm cache clean --force
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3001
CMD ["node", "dist/src/index.js"]

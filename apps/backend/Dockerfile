# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app/apps/backend
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

FROM base AS deps
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY apps/backend ./
RUN npm run db:generate
RUN npm run build

FROM deps AS migrator
COPY apps/backend ./
RUN npm run db:generate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production
COPY apps/backend/package.json apps/backend/package-lock.json ./
COPY apps/backend/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/apps/backend/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/src/index.js"]

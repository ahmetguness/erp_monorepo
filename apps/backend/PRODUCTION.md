# Backend Production Notes

## Prisma And Postgres Pooling

Plan database connections from the deploy shape, not from one process:

```text
total_connections = api_instances * DATABASE_URL.connection_limit
```

Keep `total_connections` comfortably below the PostgreSQL `max_connections` value after reserving room for migrations, admin sessions, monitoring, and background jobs.

Recommended starting points:

- Small production: 2 API instances with `connection_limit=5`.
- Medium production: 3-4 API instances with `connection_limit=5`, preferably behind PgBouncer or a managed pooled URL.
- Worker-heavy marketplace usage: count worker instances separately in the same formula.

Example direct application URL:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/axonerp?schema=public&connection_limit=5&pool_timeout=10"
```

Example pooled URL:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6432/axonerp?schema=public&pgbouncer=true&connection_limit=5&pool_timeout=10"
```

## Marketplace Worker

The Trendyol worker claims jobs with an atomic PostgreSQL `UPDATE ... FOR UPDATE SKIP LOCKED` statement. That keeps job processing safe when multiple API or worker instances are running.

For larger deployments, run worker capacity intentionally:

- API instances handle user traffic.
- Worker instances handle marketplace sync load.
- Both count toward the database connection budget above.

By default, the backend process does not start the marketplace worker. Enable it only for the process that should process jobs:

```text
APP_ROLE=worker
MARKETPLACE_WORKER_ENABLED=true
```

Use `APP_ROLE=api` for pure API instances, and `APP_ROLE=all` only for small deployments where one process intentionally handles both API traffic and background jobs.

## Pre-Deploy Quality Gate

Run these checks before promoting a production build:

```bash
cd apps/backend
npm ci
npx prisma validate
npm run build
npm run test:contracts
npm run test:tenant-isolation
npm run test:permission-gating
npm run test:web-smoke
npm run ci:artifacts
```

```bash
cd apps/web
npm ci
npm run build
```

DB-backed gates must run against an isolated database before release:

```bash
cd apps/backend
npm run test:integration
npm run db:health
npm run db:migrate:dry-run
```

Upload or retain these artifacts with the build record:

- `route-manifest.json`
- `permission-manifest.json`
- `contract-drift-report.json`

## Environment Checklist

Before production deploy, confirm:

- `DATABASE_URL` points to the production database or pooled URL with the planned `connection_limit`.
- `JWT_SECRET`, `ADMIN_JWT_SECRET`, and `ENCRYPTION_KEY` are set from secret storage.
- `ALLOWED_ORIGINS` contains only approved production origins.
- `STORAGE_DRIVER` is production-ready; local uploads require an explicit exception.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and notification addresses are production values.
- `OPENAI_API_KEY` is set only when AI features should be enabled.
- Worker variables are scoped to worker processes only: `APP_ROLE`, `MARKETPLACE_WORKER_ENABLED`, `DOMAIN_EVENT_OUTBOX_WORKER_ENABLED`, and `WORKER_CONCURRENCY`.

## Migration Dry-Run Standard

Run `npm run db:migrate:dry-run` from `apps/backend` before production migration. Review the SQL for destructive changes, long locks, tenant-scoped uniqueness changes, and financial or stock history impact. Do not proceed when the dry-run contains unexpected `DROP`, ownership rewrites, or broad table rewrites.

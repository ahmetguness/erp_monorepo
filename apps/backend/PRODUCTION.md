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

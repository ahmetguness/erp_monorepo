import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const app = new Hono();
const PORT = Number(process.env.PORT) || 3001;

// ── HTTP istek logu ──────────────────────────
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  logger.http(c.req.method, c.req.path, c.res.status, Date.now() - start);
});

// ── Routes ───────────────────────────────────
app.get('/', (c) => c.json({ status: 'ok', service: 'Axon ERP API' }));

app.get('/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', db: 'connected' });
  } catch {
    return c.json({ status: 'error', db: 'disconnected' }, 500);
  }
});

app.get('/users', async (c) => {
  const users = await prisma.user.findMany();
  return c.json(users);
});

// ── Başlangıç logu ───────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log('');
  console.log('  \x1b[36m\x1b[1m Axon ERP API\x1b[0m');
  console.log('  \x1b[2m─────────────────────────────\x1b[0m');
  logger.success(`Server     → http://localhost:${PORT}`);
  logger.success(`Health     → http://localhost:${PORT}/health`);
  logger.info(`Environment → ${process.env.NODE_ENV ?? 'development'}`);
  console.log('');
});

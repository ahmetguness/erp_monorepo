import { Hono } from 'hono';
import { getPublicStatusIncidents } from '../modules/platform/index.js';

const statusRoutes = new Hono();
statusRoutes.get('/incidents', async (c) => c.json({ data: await getPublicStatusIncidents() }));

export { statusRoutes };

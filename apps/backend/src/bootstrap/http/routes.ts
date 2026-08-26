import { Hono } from 'hono';
import { tenantIsolationBypass } from '../../lib/tenant-isolation-context.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  registerAdminHttpSurface,
  registerExternalHttpSurface,
  registerProgrammaticHttpSurface,
  registerPublicHttpSurface,
} from '../../modules/http-surfaces/index.js';
import { tenantModules } from '../../modules/index.js';
import { registerBrowserProtection } from './middleware.js';

export function registerPublicRoutes(app: Hono): void {
  app.get('/', (context) => context.json({ status: 'ok', service: 'Axon ERP API' }));
  app.get('/health', (context) => context.json({ status: 'ok' }));

  app.use('/api/public/*', tenantIsolationBypass('public-api'));
  app.use('/api/scim/v2/*', tenantIsolationBypass('scim-provisioning'));
  app.use('/api/bi/v1/*', tenantIsolationBypass('bi-connector'));
  app.use('/api/portal/v1/*', tenantIsolationBypass('customer-portal'));
  app.use('/api/auth/*', tenantIsolationBypass('auth-bootstrap'));
  app.use('/api/admin/*', tenantIsolationBypass('admin-console'));

  registerProgrammaticHttpSurface(app);
  registerBrowserProtection(app);
  registerPublicHttpSurface(app);
  registerAdminHttpSurface(app);
}

export function registerTenantRoutes(app: Hono): void {
  const tenantApi = new Hono();
  tenantApi.use('*', requireAuth);
  for (const module of tenantModules) module.register(tenantApi);

  registerExternalHttpSurface(app);
  app.route('/api', tenantApi);
}

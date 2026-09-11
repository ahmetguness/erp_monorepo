import type { Hono } from 'hono';
import { adminRoutes } from '../../routes/admin.routes.js';
import { statusRoutes } from '../../routes/status.routes.js';
import { authRoutes } from '../../routes/auth.routes.js';
import { biRoutes } from '../../routes/bi.routes.js';
import { demoAdminRoutes,demoPublicRoutes } from '../../routes/demo.routes.js';
import { externalRoutes } from '../../routes/external.routes.js';
import { invitationPublicRoutes } from '../../routes/invitation.routes.js';
import { portalRoutes } from '../../routes/portal.routes.js';
import { publicChatRoutes } from '../../routes/public-chat.routes.js';
import { scimRoutes } from '../../routes/scim.routes.js';
import { SetPasswordController } from '../identity/http/controllers/index.js';
import { TrendyolWebhookController } from '../marketplace/http/controllers/index.js';

/** Programmatic callers are registered before browser CSRF protection. */
export function registerProgrammaticHttpSurface(app: Hono): void {
  app.post('/api/public/trendyol/webhook/:integrationId', TrendyolWebhookController.handle);
  app.post('/api/public/marketplace/webhook/:integrationId', TrendyolWebhookController.handle);
  app.route('/api/scim/v2', scimRoutes);
  app.route('/api/bi/v1', biRoutes);
  app.route('/api/portal/v1', portalRoutes);
}

/** Browser-facing public endpoints are registered after CSRF protection. */
export function registerPublicHttpSurface(app: Hono): void {
  app.route('/api/auth', authRoutes);
  app.route('/api/public', demoPublicRoutes);
  app.route('/api/public', invitationPublicRoutes);
  app.route('/api/public', publicChatRoutes);
  app.post('/api/public/set-password', SetPasswordController.setPassword);
  app.post('/api/public/set-password/validate', SetPasswordController.validateToken);
}

export function registerAdminHttpSurface(app: Hono): void {
  app.route('/api/admin', adminRoutes);
  app.route('/api/status', statusRoutes);
  app.route('/api/admin', demoAdminRoutes);
}

export function registerExternalHttpSurface(app: Hono): void {
  app.route('/api/external', externalRoutes);
}

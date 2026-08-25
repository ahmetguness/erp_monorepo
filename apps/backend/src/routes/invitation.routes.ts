import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { InvitationController } from '../modules/identity/http/controllers/index.js';

/** Tenant routes (JWT korumalı — index.ts'de tenantApi altına bağlanır) */
export const invitationRoutes = new Hono();
invitationRoutes.post('/', requirePermission('users', 'CREATE'), InvitationController.create);
invitationRoutes.get('/', requirePermission('users', 'READ'), InvitationController.list);
invitationRoutes.post('/:id/cancel', requirePermission('users', 'UPDATE'), InvitationController.cancel);

/** Public routes (JWT gerektirmez) */
export const invitationPublicRoutes = new Hono();
invitationPublicRoutes.post('/invitations/validate', InvitationController.validate);
invitationPublicRoutes.post('/invitations/accept', InvitationController.accept);

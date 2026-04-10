import { Hono } from 'hono';
import { InvitationController } from '../controllers/invitation.controller';

/** Tenant routes (JWT korumalı — index.ts'de tenantApi altına bağlanır) */
export const invitationRoutes = new Hono();
invitationRoutes.post('/', InvitationController.create);
invitationRoutes.get('/', InvitationController.list);
invitationRoutes.post('/:id/cancel', InvitationController.cancel);

/** Public routes (JWT gerektirmez) */
export const invitationPublicRoutes = new Hono();
invitationPublicRoutes.post('/invitations/validate', InvitationController.validate);
invitationPublicRoutes.post('/invitations/accept', InvitationController.accept);

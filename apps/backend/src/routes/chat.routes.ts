import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { ChatController } from '../modules/automation-intelligence/http/controllers/index.js';

export const chatRoutes = new Hono();

// AI Chat Enterprise plan gerektiriyor
chatRoutes.use('*', requireAccess(ACCESS_POLICIES.chat));

chatRoutes.post('/', requirePermission('chat', 'CREATE'), ChatController.send);
chatRoutes.post('/stream', requirePermission('chat', 'CREATE'), ChatController.sendStream);
chatRoutes.delete('/history', requirePermission('chat', 'DELETE'), ChatController.clear);

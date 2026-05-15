import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { ChatController } from '../controllers/chat.controller';

export const chatRoutes = new Hono();

// AI Chat Enterprise plan gerektiriyor
chatRoutes.use('*', requirePlan(Plan.ENTERPRISE));

chatRoutes.post('/', requirePermission('chat', 'CREATE'), ChatController.send);
chatRoutes.post('/stream', requirePermission('chat', 'CREATE'), ChatController.sendStream);
chatRoutes.delete('/history', requirePermission('chat', 'DELETE'), ChatController.clear);

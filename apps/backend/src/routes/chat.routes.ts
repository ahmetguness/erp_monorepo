import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { ChatController } from '../controllers/chat.controller';

export const chatRoutes = new Hono();

// AI Chat Enterprise plan gerektiriyor
chatRoutes.use('*', requirePlan(Plan.ENTERPRISE));

chatRoutes.post('/', ChatController.send);
chatRoutes.post('/stream', ChatController.sendStream);
chatRoutes.delete('/history', ChatController.clear);

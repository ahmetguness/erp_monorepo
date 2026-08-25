import { Hono } from 'hono';
import { PublicChatController } from '../modules/automation-intelligence/http/controllers/index.js';

export const publicChatRoutes = new Hono();

publicChatRoutes.post('/chat', PublicChatController.send);
publicChatRoutes.post('/chat/stream', PublicChatController.sendStream);

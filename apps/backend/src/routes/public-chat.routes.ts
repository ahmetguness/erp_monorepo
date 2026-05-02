import { Hono } from 'hono';
import { PublicChatController } from '../controllers/public-chat.controller';

export const publicChatRoutes = new Hono();

publicChatRoutes.post('/chat', PublicChatController.send);
publicChatRoutes.post('/chat/stream', PublicChatController.sendStream);

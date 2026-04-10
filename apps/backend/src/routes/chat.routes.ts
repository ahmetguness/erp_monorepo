import { Hono } from 'hono';
import { ChatController } from '../controllers/chat.controller';

export const chatRoutes = new Hono();

chatRoutes.post('/', ChatController.send);

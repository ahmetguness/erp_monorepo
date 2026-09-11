import { Hono } from 'hono';
import { SupportTicketController } from '../modules/platform/http/controllers/index.js';

export const supportTicketRoutes = new Hono();

supportTicketRoutes.get('/', SupportTicketController.list);
supportTicketRoutes.post('/', SupportTicketController.create);
supportTicketRoutes.get('/:id', SupportTicketController.get);
supportTicketRoutes.post('/:id/messages', SupportTicketController.addMessage);
supportTicketRoutes.post('/:id/close', SupportTicketController.close);
supportTicketRoutes.post('/:id/reopen', SupportTicketController.reopen);

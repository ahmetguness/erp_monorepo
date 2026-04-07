import { Hono } from 'hono';
import { MailController } from '../controllers/mail.controller';

export const mailRoutes = new Hono();

mailRoutes.post('/send', MailController.send);
mailRoutes.post('/welcome', MailController.sendWelcome);
mailRoutes.post('/password-reset', MailController.sendPasswordReset);
mailRoutes.post('/invoice-notification', MailController.sendInvoiceNotification);
mailRoutes.post('/notification', MailController.sendNotification);

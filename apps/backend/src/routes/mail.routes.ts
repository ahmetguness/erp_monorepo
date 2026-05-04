import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { MailController } from '../controllers/mail.controller';

export const mailRoutes = new Hono();

// Mail Enterprise plan + feature gerektiriyor
mailRoutes.use('*', requirePlan(Plan.ENTERPRISE));
mailRoutes.use('*', requireFeature(FeatureKey.HR)); // HR feature altında mail erişimi

mailRoutes.post('/send', MailController.send);
mailRoutes.post('/welcome', MailController.sendWelcome);
mailRoutes.post('/password-reset', MailController.sendPasswordReset);
mailRoutes.post('/invoice-notification', MailController.sendInvoiceNotification);
mailRoutes.post('/notification', MailController.sendNotification);

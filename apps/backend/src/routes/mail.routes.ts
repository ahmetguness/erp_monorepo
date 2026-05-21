import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requirePermission } from '../middleware/requirePermission';
import { MailController } from '../controllers/mail.controller';

export const mailRoutes = new Hono();

// Mail Enterprise plan + feature gerektiriyor
mailRoutes.use('*', requirePlan(Plan.ENTERPRISE));
mailRoutes.use('*', requireFeature(FeatureKey.HR)); // HR feature altında mail erişimi

mailRoutes.get('/', requirePermission('mail', 'READ'), MailController.list);
mailRoutes.get('/templates', requirePermission('mail', 'READ'), MailController.templates);
mailRoutes.post('/templates/render', requirePermission('mail', 'CREATE'), MailController.renderTemplate);
mailRoutes.post('/ai-draft', requirePermission('mail', 'CREATE'), MailController.aiDraft);
mailRoutes.get('/:id', requirePermission('mail', 'READ'), MailController.get);
mailRoutes.post('/send', requirePermission('mail', 'CREATE'), MailController.send);
mailRoutes.post('/bulk', requirePermission('mail', 'CREATE'), MailController.bulk);
mailRoutes.post('/welcome', requirePermission('mail', 'CREATE'), MailController.sendWelcome);
mailRoutes.post('/password-reset', requirePermission('mail', 'CREATE'), MailController.sendPasswordReset);
mailRoutes.post('/invoice-notification', requirePermission('mail', 'CREATE'), MailController.sendInvoiceNotification);
mailRoutes.post('/notification', requirePermission('mail', 'CREATE'), MailController.sendNotification);

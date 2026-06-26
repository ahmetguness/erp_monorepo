import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { MailController } from '../controllers/mail.controller';

export const mailRoutes = new Hono();

// Mail Enterprise plan + feature gerektiriyor
mailRoutes.use('*', requireAccess(ACCESS_POLICIES.mail));

mailRoutes.get('/', requirePermission('mail', 'READ'), MailController.list);
mailRoutes.get('/summary', requirePermission('mail', 'READ'), MailController.summary);
mailRoutes.get('/templates', requirePermission('mail', 'READ'), MailController.templates);
mailRoutes.get('/templates/lifecycle', requirePermission('mail', 'READ'), MailController.templateLifecycle);
mailRoutes.post('/templates/custom', requirePermission('mail', 'CREATE'), MailController.createTemplate);
mailRoutes.put('/templates/custom/:id', requirePermission('mail', 'UPDATE'), MailController.updateTemplate);
mailRoutes.post('/templates/custom/:id/approval', requirePermission('mail', 'UPDATE'), MailController.approveTemplate);
mailRoutes.delete('/templates/custom/:id', requirePermission('mail', 'DELETE'), MailController.deleteTemplate);
mailRoutes.post('/templates/render', requirePermission('mail', 'CREATE'), MailController.renderTemplate);
mailRoutes.post('/ai-draft', requirePermission('mail', 'CREATE'), MailController.aiDraft);
mailRoutes.get('/:id', requirePermission('mail', 'READ'), MailController.get);
mailRoutes.post('/send', requirePermission('mail', 'CREATE'), MailController.send);
mailRoutes.post('/bulk', requirePermission('mail', 'CREATE'), MailController.bulk);
mailRoutes.post('/welcome', requirePermission('mail', 'CREATE'), MailController.sendWelcome);
mailRoutes.post('/password-reset', requirePermission('mail', 'CREATE'), MailController.sendPasswordReset);
mailRoutes.post('/invoice-notification', requirePermission('mail', 'CREATE'), MailController.sendInvoiceNotification);
mailRoutes.post('/notification', requirePermission('mail', 'CREATE'), MailController.sendNotification);

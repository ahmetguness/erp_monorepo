import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { ApprovalController } from '../controllers/approval.controller';

const approvalRoutes = new Hono();

approvalRoutes.use('*', requireAccess(ACCESS_POLICIES.approvals));

// Approval Flows
approvalRoutes.get('/flows', requirePermission('approvals', 'READ'), ApprovalController.listFlows);
approvalRoutes.get('/flows/:id', requirePermission('approvals', 'READ'), ApprovalController.getFlow);
approvalRoutes.post('/flows', requirePermission('approvals', 'CREATE'), ApprovalController.createFlow);
approvalRoutes.patch('/flows/:id', requirePermission('approvals', 'UPDATE'), ApprovalController.updateFlow);
approvalRoutes.delete('/flows/:id', requirePermission('approvals', 'DELETE'), ApprovalController.deleteFlow);

// Approval Requests
approvalRoutes.get('/requests', requirePermission('approvals', 'READ'), ApprovalController.listRequests);
approvalRoutes.post('/requests', requirePermission('approvals', 'CREATE'), ApprovalController.createRequest);
approvalRoutes.post('/requests/:id/action', requirePermission('approvals', 'UPDATE'), ApprovalController.addAction);
approvalRoutes.delete('/requests/:id', requirePermission('approvals', 'DELETE'), ApprovalController.deleteRequest);

export { approvalRoutes };

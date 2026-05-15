import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requirePermission } from '../middleware/requirePermission';
import { ApprovalController } from '../controllers/approval.controller';

const approvalRoutes = new Hono();

approvalRoutes.use('*', requirePlan(Plan.PROFESSIONAL));
approvalRoutes.use('*', requireFeature(FeatureKey.APPROVALS));

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

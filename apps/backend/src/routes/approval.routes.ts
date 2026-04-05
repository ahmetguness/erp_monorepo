import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { ApprovalController } from '../controllers/approval.controller';

const approvalRoutes = new Hono();

approvalRoutes.use('*', requirePlan('PROFESSIONAL'));
approvalRoutes.use('*', requireFeature(FeatureKey.APPROVALS));

// Approval Flows
approvalRoutes.get('/flows', ApprovalController.listFlows);
approvalRoutes.get('/flows/:id', ApprovalController.getFlow);
approvalRoutes.post('/flows', ApprovalController.createFlow);
approvalRoutes.patch('/flows/:id', ApprovalController.updateFlow);
approvalRoutes.delete('/flows/:id', ApprovalController.deleteFlow);

// Approval Requests
approvalRoutes.get('/requests', ApprovalController.listRequests);
approvalRoutes.post('/requests', ApprovalController.createRequest);
approvalRoutes.post('/requests/:id/action', ApprovalController.addAction);

export { approvalRoutes };

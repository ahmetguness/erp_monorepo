import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { ApprovalController } from '../controllers/approval.controller';

const approvalRoutes = new Hono();

approvalRoutes.use('*', requirePlan('PROFESSIONAL'));

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

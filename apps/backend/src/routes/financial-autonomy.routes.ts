import { Hono } from 'hono';
import { FinancialAutonomyController } from '../services/controllers/financial-autonomy.controller.service.js';

const financialAutonomyRoutes = new Hono();

financialAutonomyRoutes.get('/cash-flow-forecast', FinancialAutonomyController.getCashFlowForecast);
financialAutonomyRoutes.get('/contact-velocity/:contactId', FinancialAutonomyController.getContactVelocity);
financialAutonomyRoutes.post('/collection-settlement/:invoiceId', FinancialAutonomyController.generateCollectionSettlement);
financialAutonomyRoutes.get('/recommendations', FinancialAutonomyController.getRecommendations);
financialAutonomyRoutes.post('/execute-action', FinancialAutonomyController.executeAction);

export { financialAutonomyRoutes };

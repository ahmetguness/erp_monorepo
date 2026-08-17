import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePermission } from '../middleware/requirePermission';
import { requirePlan } from '../middleware/requirePlan';
import { IntelligenceController } from '../controllers/intelligence.controller';

const intelligenceRoutes = new Hono();

intelligenceRoutes.get('/recommendations', IntelligenceController.recommendations);
intelligenceRoutes.get('/ai-governance/logs', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'READ'), IntelligenceController.aiGovernanceLogs);
intelligenceRoutes.get('/ai-governance/policy', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'READ'), IntelligenceController.aiGovernancePolicy);
intelligenceRoutes.get('/ai-governance/insights', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'READ'), IntelligenceController.aiGovernanceInsights);
intelligenceRoutes.put('/ai-governance/insights/settings', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'UPDATE'), IntelligenceController.updateAiGovernanceInsightsSettings);
intelligenceRoutes.put('/ai-governance/policy', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'UPDATE'), IntelligenceController.updateAiGovernancePolicy);
intelligenceRoutes.post('/ai-governance/action-audit', IntelligenceController.recordAiActionAudit);
intelligenceRoutes.get('/automation-rules/templates', IntelligenceController.automationTemplates);
intelligenceRoutes.get('/automation-rules/preview', IntelligenceController.automationPreview);
intelligenceRoutes.get('/sector-templates', IntelligenceController.sectorTemplates);
intelligenceRoutes.get('/ocr/attachments/:id/draft', IntelligenceController.documentDraft);

// Phase 15 AI Pipeline Routes
intelligenceRoutes.post('/ai/ocr', IntelligenceController.processOcr);
intelligenceRoutes.post('/ai/email-to-order', IntelligenceController.extractOrderFromEmail);
intelligenceRoutes.post('/ai/match-payment', IntelligenceController.matchPayment);
intelligenceRoutes.get('/ai/anomalies', IntelligenceController.detectAnomalies);
intelligenceRoutes.post('/ai/nl-query', IntelligenceController.nlQuery);
intelligenceRoutes.post('/ai/execute-suggestion', IntelligenceController.executeAiSuggestion);

export { intelligenceRoutes };

import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePermission } from '../middleware/requirePermission';
import { requirePlan } from '../middleware/requirePlan';
import { IntelligenceController } from '../controllers/intelligence.controller';

const intelligenceRoutes = new Hono();

intelligenceRoutes.get('/recommendations', IntelligenceController.recommendations);
intelligenceRoutes.get('/ai-governance/logs', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'READ'), IntelligenceController.aiGovernanceLogs);
intelligenceRoutes.get('/ai-governance/policy', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'READ'), IntelligenceController.aiGovernancePolicy);
intelligenceRoutes.put('/ai-governance/policy', requirePlan(Plan.ENTERPRISE), requirePermission('ai_governance', 'UPDATE'), IntelligenceController.updateAiGovernancePolicy);
intelligenceRoutes.post('/ai-governance/action-audit', IntelligenceController.recordAiActionAudit);
intelligenceRoutes.get('/automation-rules/templates', IntelligenceController.automationTemplates);
intelligenceRoutes.get('/automation-rules/preview', IntelligenceController.automationPreview);
intelligenceRoutes.get('/sector-templates', IntelligenceController.sectorTemplates);
intelligenceRoutes.get('/ocr/attachments/:id/draft', IntelligenceController.documentDraft);

export { intelligenceRoutes };

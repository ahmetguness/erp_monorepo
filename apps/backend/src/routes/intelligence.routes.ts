import { Hono } from 'hono';
import { IntelligenceController } from '../controllers/intelligence.controller';

const intelligenceRoutes = new Hono();

intelligenceRoutes.get('/recommendations', IntelligenceController.recommendations);
intelligenceRoutes.get('/ai-governance/logs', IntelligenceController.aiGovernanceLogs);
intelligenceRoutes.get('/ai-governance/policy', IntelligenceController.aiGovernancePolicy);
intelligenceRoutes.put('/ai-governance/policy', IntelligenceController.updateAiGovernancePolicy);
intelligenceRoutes.post('/ai-governance/action-audit', IntelligenceController.recordAiActionAudit);
intelligenceRoutes.get('/automation-rules/templates', IntelligenceController.automationTemplates);
intelligenceRoutes.get('/automation-rules/preview', IntelligenceController.automationPreview);
intelligenceRoutes.get('/sector-templates', IntelligenceController.sectorTemplates);
intelligenceRoutes.get('/ocr/attachments/:id/draft', IntelligenceController.documentDraft);

export { intelligenceRoutes };

import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireParam, requireTenantId, requireUserId } from '../../../../utils/context.js';
import { AutomationScorecardService, type AutomationFeedbackInput, type AutomationFeedbackOutcome } from '../../application/automation-scorecard/index.js';
import { PrismaAutomationScorecardRepository } from '../../infrastructure/persistence/prisma-automation-scorecard.repository.js';
const service = new AutomationScorecardService(new PrismaAutomationScorecardRepository(prisma)); const outcomes = new Set<unknown>(['ACCEPTED', 'REJECTED', 'CORRECTED']);
function optionalNumber(value: unknown, allowNegative: boolean): number | null { if (value === undefined || value === null || value === '') return null; const parsed = Number(value); if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) throw new ValidationError('Sayısal metrik geçersiz.'); return parsed; }
export const AutomationScorecardController = {
  async get(c: Context): Promise<Response> { const days = Number(c.req.query('days') ?? 30); if (![7, 30, 90].includes(days)) throw new ValidationError('days yalnızca 7, 30 veya 90 olabilir.'); return c.json({ data: await service.get(requireTenantId(c), days) }); },
  async feedback(c: Context): Promise<Response> { const body = await c.req.json<unknown>(); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Geri bildirim zorunludur.'); const data = body as Record<string, unknown>; if (!outcomes.has(data.outcome)) throw new ValidationError('Geçerli outcome zorunludur.'); const input: AutomationFeedbackInput = { outcome: data.outcome as AutomationFeedbackOutcome, reason: typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim().slice(0, 300) : null, estimatedMinutesSaved: optionalNumber(data.estimatedMinutesSaved, false), financialImpact: optionalNumber(data.financialImpact, true) }; return c.json({ data: await service.feedback(requireTenantId(c), requireUserId(c), requireParam(c, 'executionId'), input) }); },
};

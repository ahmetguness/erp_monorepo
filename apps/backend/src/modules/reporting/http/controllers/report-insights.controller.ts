import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';
import { ReportDecisionInsightsService } from '../../application/decision-insights/index.js';
import { PrismaReportInsightsRepository } from '../../infrastructure/persistence/index.js';
import { parseReportInsightPeriod } from '../schemas/report-insight-period.js';

const service = new ReportDecisionInsightsService(new PrismaReportInsightsRepository(prisma));

export const ReportInsightsController = {
  async workspace(c: Context): Promise<Response> {
    const period = parseReportInsightPeriod(c.req.query('dateFrom'), c.req.query('dateTo'));
    if (!period) return c.json(new ValidationError('Rapor tarih aralığı geçersiz veya 366 günden uzundur.').toJSON(), 400);
    return c.json({ data: await service.workspace(requireTenantId(c), period.from, period.to) });
  },
};

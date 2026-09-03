import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';
import { FinanceOperationsService, type FinanceOperationsPolicy } from '../../application/operations/index.js';
import { BankTransactionMatchingGateway } from '../../infrastructure/bank-matching.gateway.js';
import { PrismaFinanceOperationsRepository } from '../../infrastructure/persistence/prisma-finance-operations.repository.js';

const service = new FinanceOperationsService(new PrismaFinanceOperationsRepository(prisma), new BankTransactionMatchingGateway(prisma));

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function parsePolicy(value: unknown): FinanceOperationsPolicy | null {
  if (!isRecord(value) || typeof value.autoProcessEnabled !== 'boolean' || typeof value.autoMatchMinConfidence !== 'number' || typeof value.feedStaleHours !== 'number' || typeof value.duplicateWindowDays !== 'number') return null;
  return { autoProcessEnabled: value.autoProcessEnabled, autoMatchMinConfidence: value.autoMatchMinConfidence, feedStaleHours: value.feedStaleHours, duplicateWindowDays: value.duplicateWindowDays };
}

export const FinanceOperationsController = {
  async workspace(c: Context): Promise<Response> { return c.json({ data: await service.getWorkspace(requireTenantId(c)) }); },
  async updatePolicy(c: Context): Promise<Response> {
    const policy = parsePolicy(await c.req.json<unknown>().catch(() => null));
    if (!policy) return c.json(new ValidationError('Finans operasyon politikası geçersiz.').toJSON(), 400);
    return c.json({ data: await service.updatePolicy(requireTenantId(c), policy) });
  },
  async run(c: Context): Promise<Response> { return c.json({ data: await service.run(requireTenantId(c)) }); },
};

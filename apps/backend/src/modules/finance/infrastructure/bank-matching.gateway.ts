import type { PrismaClient } from '@prisma/client';
import { BankTransactionMatchingService } from '../../../services/bank-transaction-matching.service.js';
import type { BankMatchingGateway } from '../application/operations/index.js';

export class BankTransactionMatchingGateway implements BankMatchingGateway {
  private readonly service: BankTransactionMatchingService;
  constructor(db: PrismaClient) { this.service = new BankTransactionMatchingService(db); }
  workbench(tenantId: string) { return this.service.workbench(tenantId); }
  autoProcess(tenantId: string, input: { minConfidence: number; limit: number }) { return this.service.autoProcess(tenantId, input); }
}

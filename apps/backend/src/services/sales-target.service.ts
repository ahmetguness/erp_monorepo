import { InvoiceStatus, InvoiceType, PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';

const SALES_TARGET_SETTING_PREFIX = 'sales_target';
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface SalesTargetSnapshot {
  month: string;
  targetAmount: number;
  actualAmount: number;
  progressPercent: number;
  remainingAmount: number;
  startDate: string;
  endDate: string;
}

export interface UpsertSalesTargetInput {
  month: string;
  targetAmount: number;
}

interface MonthRange {
  start: Date;
  end: Date;
}

export class SalesTargetService {
  constructor(private readonly prisma: PrismaClient) {}

  async getMonthlyTarget(tenantId: string, month: string): Promise<SalesTargetSnapshot> {
    const normalizedMonth = normalizeMonth(month);
    const [targetAmount, actualAmount] = await Promise.all([
      this.readTargetAmount(tenantId, normalizedMonth),
      this.computeActualAmount(tenantId, normalizedMonth),
    ]);

    return buildSnapshot(normalizedMonth, targetAmount, actualAmount);
  }

  async upsertMonthlyTarget(tenantId: string, input: UpsertSalesTargetInput): Promise<SalesTargetSnapshot> {
    const month = normalizeMonth(input.month);
    const targetAmount = normalizeTargetAmount(input.targetAmount);

    await this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: settingKey(month) } },
      create: { tenantId, key: settingKey(month), value: String(targetAmount) },
      update: { value: String(targetAmount) },
    });

    const actualAmount = await this.computeActualAmount(tenantId, month);
    return buildSnapshot(month, targetAmount, actualAmount);
  }

  private async readTargetAmount(tenantId: string, month: string): Promise<number> {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: settingKey(month) } },
      select: { value: true },
    });

    if (!setting) return 0;
    return normalizeTargetAmount(Number(setting.value));
  }

  private async computeActualAmount(tenantId: string, month: string): Promise<number> {
    const { start, end } = monthRange(month);
    const result = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        deletedAt: null,
        type: InvoiceType.SALES,
        status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] },
        date: { gte: start, lt: end },
      },
      _sum: { totalGross: true },
    });

    return Number(result._sum.totalGross ?? 0);
  }
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function settingKey(month: string): string {
  return `${SALES_TARGET_SETTING_PREFIX}:${month}`;
}

function normalizeMonth(month: string): string {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new ValidationError('Ay YYYY-MM formatinda olmalidir.');
  return month;
}

function normalizeTargetAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError('Satis hedefi negatif olmayan sayi olmalidir.');
  }
  return Math.round(value * 100) / 100;
}

function monthRange(month: string): MonthRange {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSnapshot(month: string, targetAmount: number, actualAmount: number): SalesTargetSnapshot {
  const { start, end } = monthRange(month);
  const progressPercent = targetAmount > 0 ? Math.min(100, Math.round((actualAmount / targetAmount) * 100)) : 0;
  return {
    month,
    targetAmount,
    actualAmount,
    progressPercent,
    remainingAmount: Math.max(0, targetAmount - actualAmount),
    startDate: toIsoDate(start),
    endDate: toIsoDate(new Date(end.getTime() - 1)),
  };
}

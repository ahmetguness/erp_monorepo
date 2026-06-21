import { Prisma, CostingMethod, JournalEntryType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors/index.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { resolveOpenFiscalPeriodId, assertJournalBalanced } from './financial/index.js';

type ProductionDbClient = PrismaClient | Prisma.TransactionClient;

export interface EstimatedCosts {
  estimatedMaterialCost: number;
  estimatedLaborCost: number;
  estimatedOverheadCost: number;
}

/**
 * Calculates estimated material, labor, and overhead costs based on BOM and planned quantity.
 */
export async function calculateEstimatedCosts(
  db: ProductionDbClient,
  tenantId: string,
  bomId: string,
  plannedQty: number
): Promise<EstimatedCosts> {
  const bom = await db.bOM.findFirst({
    where: { id: bomId, tenantId },
    include: {
      items: { include: { product: true } },
      routings: true,
    },
  });

  if (!bom) {
    throw new ValidationError('Belirtilen BOM bulunamadı.');
  }

  let estimatedMaterialCost = 0;
  let estimatedLaborCost = 0;
  let estimatedOverheadCost = 0;

  // 1. Material Cost Calculation
  for (const item of bom.items) {
    const qtyNeeded = Number(item.quantity) * plannedQty;
    const avgCost = Number(item.product.averageCost ?? item.product.purchasePrice ?? 0);
    estimatedMaterialCost += qtyNeeded * avgCost;
  }

  // 2. Labor & Overhead Cost Calculation
  for (const routing of bom.routings) {
    const wc = await db.workCenter.findFirst({
      where: { id: routing.workCenterId, tenantId },
      select: { laborRate: true, overheadRate: true },
    });

    if (wc) {
      const setupTime = Number(routing.setupTime ?? 0);
      const runTime = Number(routing.runTime ?? 0);
      const totalMinutes = setupTime + (runTime * plannedQty);
      const totalHours = totalMinutes / 60;

      estimatedLaborCost += totalHours * Number(wc.laborRate ?? 0);
      estimatedOverheadCost += totalHours * Number(wc.overheadRate ?? 0);
    }
  }

  return {
    estimatedMaterialCost,
    estimatedLaborCost,
    estimatedOverheadCost,
  };
}

/**
 * Allocates work center capacity for the planned dates of a work order.
 */
export async function allocateCapacity(
  db: ProductionDbClient,
  tenantId: string,
  workOrderId: string
): Promise<void> {
  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      operations: { include: { workCenter: true } },
    },
  });

  if (!workOrder || !workOrder.startDate) return;

  const plannedQty = Number(workOrder.plannedQty);
  const start = new Date(workOrder.startDate);
  const end = workOrder.endDate ? new Date(workOrder.endDate) : start;

  // Simple date range generator
  const getDates = (startDate: Date, endDate: Date) => {
    const dates: Date[] = [];
    let curr = new Date(startDate);
    // Normalize to date only
    curr.setUTCHours(0, 0, 0, 0);
    const stop = new Date(endDate);
    stop.setUTCHours(0, 0, 0, 0);

    while (curr <= stop) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const datesRange = getDates(start, end);
  if (datesRange.length === 0) return;

  for (const op of workOrder.operations) {
    const setupTime = Number(op.plannedSetupTime ?? 0);
    const runTime = Number(op.plannedRunTime ?? 0);
    const totalMinutes = setupTime + (runTime * plannedQty);
    const totalHours = totalMinutes / 60;

    // Distribute hours evenly over the dates range
    const dailyHours = totalHours / datesRange.length;

    for (const date of datesRange) {
      const defaultCapacity = Number(op.workCenter.capacity ?? 8);

      await db.workCenterCapacity.upsert({
        where: {
          tenantId_workCenterId_date: {
            tenantId,
            workCenterId: op.workCenterId,
            date,
          },
        },
        create: {
          tenantId,
          workCenterId: op.workCenterId,
          date,
          capacity: defaultCapacity,
          allocated: dailyHours,
        },
        update: {
          allocated: { increment: dailyHours },
        },
      });
    }
  }
}

/**
 * Releases allocated capacity for a work order.
 */
export async function releaseCapacity(
  db: ProductionDbClient,
  tenantId: string,
  workOrderId: string
): Promise<void> {
  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      operations: { include: { workCenter: true } },
    },
  });

  if (!workOrder || !workOrder.startDate) return;

  const plannedQty = Number(workOrder.plannedQty);
  const start = new Date(workOrder.startDate);
  const end = workOrder.endDate ? new Date(workOrder.endDate) : start;

  const getDates = (startDate: Date, endDate: Date) => {
    const dates: Date[] = [];
    let curr = new Date(startDate);
    curr.setUTCHours(0, 0, 0, 0);
    const stop = new Date(endDate);
    stop.setUTCHours(0, 0, 0, 0);

    while (curr <= stop) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const datesRange = getDates(start, end);
  if (datesRange.length === 0) return;

  for (const op of workOrder.operations) {
    const setupTime = Number(op.plannedSetupTime ?? 0);
    const runTime = Number(op.plannedRunTime ?? 0);
    const totalMinutes = setupTime + (runTime * plannedQty);
    const totalHours = totalMinutes / 60;
    const dailyHours = totalHours / datesRange.length;

    for (const date of datesRange) {
      const cap = await db.workCenterCapacity.findUnique({
        where: {
          tenantId_workCenterId_date: {
            tenantId,
            workCenterId: op.workCenterId,
            date,
          },
        },
      });

      if (cap) {
        const nextAllocated = Math.max(0, Number(cap.allocated) - dailyHours);
        await db.workCenterCapacity.update({
          where: { id: cap.id },
          data: { allocated: nextAllocated },
        });
      }
    }
  }
}

/**
 * Creates an automatic balanced journal entry for a completed manufacturing work order.
 */
export async function postProductionAccountingEntry(
  db: ProductionDbClient,
  tenantId: string,
  workOrderId: string,
  userId: string
): Promise<void> {
  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: { product: true },
  });

  if (!workOrder) throw new ValidationError('İş emri bulunamadı.');

  const actualMat = Number(workOrder.actualMaterialCost ?? 0);
  const actualLab = Number(workOrder.actualLaborCost ?? 0);
  const actualOvh = Number(workOrder.actualOverheadCost ?? 0);
  const scrapCost = Number(workOrder.scrapCost ?? 0);

  const totalCost = actualMat + actualLab + actualOvh;
  if (totalCost <= 0) return; // No costing occurred

  // Net Finished Goods Cost = Total Cost - Scrap Cost
  const finishedGoodsCost = Math.max(0, totalCost - scrapCost);

  // Fetch accounts to resolve TDHP (Tek Düzen Hesap Planı) structures
  const accounts = await db.ledgerAccount.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, accountType: true },
  });

  const findAccount = (prefix: string, keywords: string[], fallbackType: string) => {
    let acc = accounts.find((a) => a.code.startsWith(prefix));
    if (!acc) {
      acc = accounts.find((a) => keywords.some((kw) => a.name.toLowerCase().includes(kw)));
    }
    if (!acc) {
      acc = accounts.find((a) => a.accountType === fallbackType);
    }
    if (!acc) {
      throw new ValidationError(`Muhasebe entegrasyonu için uygun bir hesap bulunamadı (Aranan: Kod ${prefix} veya anahtar kelime: ${keywords.join(', ')}).`);
    }
    return acc;
  };

  const finishedGoodsAcc = findAccount('152', ['mamul', 'finished goods'], 'ASSET');
  const rawMaterialsAcc = findAccount('150', ['hammadde', 'malzeme', 'raw material'], 'ASSET');
  const laborAcc = findAccount('720', ['işçilik', 'labor'], 'EXPENSE');
  const overheadAcc = findAccount('730', ['genel üretim', 'gider', 'overhead'], 'EXPENSE');
  const scrapAcc = findAccount('689', ['zayiat', 'fire', 'scrap', 'kabul edilmeyen'], 'EXPENSE');

  const lines: { accountId: string; debit: number; credit: number; description: string }[] = [];

  // Finished Goods debit
  if (finishedGoodsCost > 0) {
    lines.push({
      accountId: finishedGoodsAcc.id,
      debit: finishedGoodsCost,
      credit: 0,
      description: `${workOrder.number} nolu İş Emri Mamul Girişi`,
    });
  }

  // Scrap debit
  if (scrapCost > 0) {
    lines.push({
      accountId: scrapAcc.id,
      debit: scrapCost,
      credit: 0,
      description: `${workOrder.number} nolu İş Emri Fire/Zayiat Maliyeti`,
    });
  }

  // Raw Materials credit
  if (actualMat > 0) {
    lines.push({
      accountId: rawMaterialsAcc.id,
      debit: 0,
      credit: actualMat,
      description: `${workOrder.number} nolu İş Emri Hammadde Sarfiyatı`,
    });
  }

  // Labor credit
  if (actualLab > 0) {
    lines.push({
      accountId: laborAcc.id,
      debit: 0,
      credit: actualLab,
      description: `${workOrder.number} nolu İş Emri Direkt İşçilik Payı`,
    });
  }

  // Overhead credit
  if (actualOvh > 0) {
    lines.push({
      accountId: overheadAcc.id,
      debit: 0,
      credit: actualOvh,
      description: `${workOrder.number} nolu İş Emri Genel Üretim Gideri Payı`,
    });
  }

  if (lines.length === 0) return;

  // Double check balance & enforce integrity rules
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  // If there's a minor precision mismatch, adjust the largest entry
  const diff = Number((totalDebit - totalCredit).toFixed(2));
  if (Math.abs(diff) > 0 && Math.abs(diff) < 0.05) {
    const largestLine = lines.sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))[0];
    if (largestLine.debit > 0) {
      largestLine.debit = Number((largestLine.debit - diff).toFixed(2));
    } else {
      largestLine.credit = Number((largestLine.credit + diff).toFixed(2));
    }
  }

  const journalLines = lines.map((l) => ({
    accountId: l.accountId,
    debit: new Prisma.Decimal(l.debit),
    credit: new Prisma.Decimal(l.credit),
    description: l.description,
  }));

  assertJournalBalanced(lines);

  const entryDate = new Date();
  const fiscalPeriodId = await resolveOpenFiscalPeriodId(db, tenantId, entryDate, 'Üretim muhasebe fişi');
  const number = await generateDocumentNumber(tenantId, 'journal', 'JE-', 'journalEntry');

  await db.journalEntry.create({
    data: {
      tenantId,
      fiscalPeriodId,
      type: JournalEntryType.AUTO_INVOICE,
      number,
      date: entryDate,
      description: `${workOrder.number} İş Emri Tamamlama Fişi (Otomatik)`,
      isPosted: true, // Automated entries are posted directly to keep ledger synced
      postedAt: entryDate,
      createdById: userId,
      lines: {
        create: journalLines.map((l, index) => ({
          tenantId,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          sortOrder: index,
        })),
      },
    },
  });
}

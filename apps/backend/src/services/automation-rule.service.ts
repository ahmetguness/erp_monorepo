import {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
  EntityType,
  InvoiceStatus,
  InvoiceType,
  NotificationStatus,
  PaymentStatus,
  Priority,
  TaskType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createTask } from './task.service.js';
import { getStringField } from '../utils/json.js';

interface AutomationRunResult {
  matched: number;
  tasksCreated: number;
  notificationsCreated: number;
  skipped: number;
}

interface AutomationMatch {
  sourceKey: string;
  title: string;
  detail: string;
  priority: Priority;
  module: string;
  entityType: EntityType;
  entityId: string;
  href: string;
  dueAt: Date | null;
}

function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

function getAssignedToId(rule: AutomationRule): string | null {
  return getStringField(rule.actionConfig, 'assignedToId') ?? null;
}

async function findMatches(rule: AutomationRule): Promise<AutomationMatch[]> {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86_400_000);

  switch (rule.trigger) {
    case AutomationTrigger.LOW_STOCK: {
      const stockLevels = await prisma.stockLevel.findMany({
        where: {
          tenantId: rule.tenantId,
          product: { tenantId: rule.tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } },
        },
        select: {
          productId: true,
          quantity: true,
          product: { select: { code: true, name: true, minStockLevel: true } },
        },
        take: 500,
      });

      const totals = new Map<string, { code: string; name: string; quantity: number; minStock: number }>();
      for (const level of stockLevels) {
        const current = totals.get(level.productId);
        if (current) {
          current.quantity += numberValue(level.quantity);
        } else {
          totals.set(level.productId, {
            code: level.product.code,
            name: level.product.name,
            quantity: numberValue(level.quantity),
            minStock: numberValue(level.product.minStockLevel),
          });
        }
      }

      return [...totals.entries()]
        .map(([productId, item]) => ({ productId, ...item, deficit: Math.ceil(item.minStock - item.quantity) }))
        .filter((item) => item.deficit > 0)
        .slice(0, 25)
        .map((item) => ({
          sourceKey: `low-stock:${item.productId}`,
          title: `${item.code} kritik stok`,
          detail: `${item.name} icin ${item.deficit} adet tamamlanma oneriliyor.`,
          priority: item.deficit > 10 ? Priority.CRITICAL : Priority.HIGH,
          module: 'inventory',
          entityType: EntityType.PRODUCT,
          entityId: item.productId,
          href: '/dashboard/stock/levels',
          dueAt: now,
        }));
    }
    case AutomationTrigger.OVERDUE_INVOICE:
    case AutomationTrigger.HIGH_VALUE_INVOICE: {
      const minAmount = rule.trigger === AutomationTrigger.HIGH_VALUE_INVOICE ? 100_000 : 0;
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: rule.tenantId,
          deletedAt: null,
          type: InvoiceType.SALES,
          ...(rule.trigger === AutomationTrigger.OVERDUE_INVOICE
            ? {
                OR: [
                  { status: InvoiceStatus.OVERDUE },
                  { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } },
                ],
              }
            : { status: { not: InvoiceStatus.CANCELLED }, totalGross: { gte: minAmount } }),
        },
        select: { id: true, number: true, dueDate: true, totalGross: true, contact: { select: { name: true } } },
        orderBy: rule.trigger === AutomationTrigger.OVERDUE_INVOICE ? { dueDate: 'asc' } : { totalGross: 'desc' },
        take: 25,
      });

      return invoices.map((invoice) => ({
        sourceKey: `${rule.trigger.toLowerCase()}:${invoice.id}`,
        title: rule.trigger === AutomationTrigger.OVERDUE_INVOICE ? `${invoice.number} tahsilat takibi` : `${invoice.number} onay kontrolu`,
        detail: `${invoice.contact?.name ?? 'Cari'} - ${numberValue(invoice.totalGross).toFixed(2)} TRY`,
        priority: rule.trigger === AutomationTrigger.HIGH_VALUE_INVOICE ? Priority.HIGH : Priority.CRITICAL,
        module: 'invoicing',
        entityType: EntityType.INVOICE,
        entityId: invoice.id,
        href: `/dashboard/invoices/${invoice.id}`,
        dueAt: invoice.dueDate ?? now,
      }));
    }
    case AutomationTrigger.LOW_MARGIN: {
      const products = await prisma.product.findMany({
        where: { tenantId: rule.tenantId, deletedAt: null, isActive: true, salesPrice: { gt: 0 } },
        select: { id: true, code: true, name: true, purchasePrice: true, salesPrice: true, averageCost: true },
        take: 500,
      });

      return products
        .map((product) => {
          const cost = numberValue(product.averageCost) > 0 ? numberValue(product.averageCost) : numberValue(product.purchasePrice);
          const salesPrice = numberValue(product.salesPrice);
          const marginRate = salesPrice > 0 ? (salesPrice - cost) / salesPrice : 0;
          return { product, marginRate };
        })
        .filter((item) => item.marginRate < 0.12)
        .slice(0, 25)
        .map(({ product, marginRate }) => ({
          sourceKey: `low-margin:${product.id}`,
          title: `${product.code} kar marji kontrolu`,
          detail: `${product.name} marji ${(marginRate * 100).toFixed(1)}%. Fiyat gozden gecirilmeli.`,
          priority: marginRate < 0 ? Priority.CRITICAL : Priority.MEDIUM,
          module: 'inventory',
          entityType: EntityType.PRODUCT,
          entityId: product.id,
          href: `/dashboard/products/${product.id}`,
          dueAt: null,
        }));
    }
    case AutomationTrigger.CHECK_DUE_SOON: {
      const checks = await prisma.checkPromissoryNote.findMany({
        where: {
          tenantId: rule.tenantId,
          deletedAt: null,
          status: { in: ['PENDING', 'DEPOSITED'] },
          dueDate: { lte: soon },
        },
        select: { id: true, number: true, type: true, amount: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 25,
      });
      return checks.map((check) => ({
        sourceKey: `check-due:${check.id}`,
        title: `${check.number} cek/senet takibi`,
        detail: `${check.type} - ${numberValue(check.amount).toFixed(2)} TRY`,
        priority: check.dueDate < now ? Priority.HIGH : Priority.MEDIUM,
        module: 'accounting',
        entityType: EntityType.OTHER,
        entityId: check.id,
        href: '/dashboard/check-promissory',
        dueAt: check.dueDate,
      }));
    }
  }
}

export const AutomationRuleService = {
  async runRule(rule: AutomationRule): Promise<AutomationRunResult> {
    const matches = await findMatches(rule);
    const assignedToId = getAssignedToId(rule);
    let tasksCreated = 0;
    let notificationsCreated = 0;

    for (const match of matches) {
      if (
        rule.action === AutomationAction.CREATE_TASK ||
        rule.action === AutomationAction.DRAFT_REMINDER_EMAIL ||
        rule.action === AutomationAction.REQUEST_APPROVAL ||
        rule.action === AutomationAction.CREATE_PURCHASE_REQUEST_DRAFT
      ) {
        await createTask(rule.tenantId, {
          title: match.title,
          detail: match.detail,
          type: TaskType.AUTOMATION,
          priority: match.priority,
          module: match.module,
          entityType: match.entityType,
          entityId: match.entityId,
          href: match.href,
          source: `automation:${rule.id}:${match.sourceKey}`,
          assignedToId,
          dueAt: match.dueAt,
        });
        tasksCreated += 1;
      } else if (rule.action === AutomationAction.CREATE_NOTIFICATION && assignedToId) {
        await prisma.notification.create({
          data: {
            tenantId: rule.tenantId,
            userId: assignedToId,
            title: match.title,
            message: match.detail,
            module: match.module,
            entityType: match.entityType,
            entityId: match.entityId,
            status: NotificationStatus.UNREAD,
          },
        });
        notificationsCreated += 1;
      }
    }

    const result: AutomationRunResult = {
      matched: matches.length,
      tasksCreated,
      notificationsCreated,
      skipped: matches.length - tasksCreated - notificationsCreated,
    };

    await prisma.automationRule.updateMany({
      where: { id: rule.id, tenantId: rule.tenantId },
      data: {
        lastRunAt: new Date(),
        lastResult: {
          matched: result.matched,
          tasksCreated: result.tasksCreated,
          notificationsCreated: result.notificationsCreated,
          skipped: result.skipped,
        },
      },
    });

    return result;
  },

  async runActiveRules(tenantId: string): Promise<AutomationRunResult> {
    const rules = await prisma.automationRule.findMany({ where: { tenantId, deletedAt: null, isActive: true } });
    const total: AutomationRunResult = { matched: 0, tasksCreated: 0, notificationsCreated: 0, skipped: 0 };
    for (const rule of rules) {
      const result = await this.runRule(rule);
      total.matched += result.matched;
      total.tasksCreated += result.tasksCreated;
      total.notificationsCreated += result.notificationsCreated;
      total.skipped += result.skipped;
    }
    return total;
  },
};

import { prisma } from '../lib/prisma';

export const CHAT_ENTITY_TYPES = [
  'contact',
  'invoice',
  'sales_quote',
  'sales_order',
  'employee',
  'product',
] as const;

export type ChatEntityType = (typeof CHAT_ENTITY_TYPES)[number];

export interface ChatRecentRecord {
  entityType: ChatEntityType;
  entityId: string;
  label: string;
  path: string;
  viewedAt: string;
}

export interface ChatPageContext {
  path: string;
  title?: string;
  entityType?: ChatEntityType;
  entityId?: string;
  entityLabel?: string;
  recentRecords: ChatRecentRecord[];
}

export interface ChatPermissionSet {
  isOwner: boolean;
  modules: Array<{ module: string; action: string }>;
}

export interface LoadedChatEntityContext {
  allowed: boolean;
  entityType?: ChatEntityType;
  summary?: Record<string, unknown>;
  suggestedActions: string[];
  message?: string;
}

const ENTITY_MODULES: Record<ChatEntityType, string> = {
  contact: 'contacts',
  invoice: 'invoicing',
  sales_quote: 'invoicing',
  sales_order: 'invoicing',
  employee: 'hr',
  product: 'inventory',
};

const TENANT_MODULE_TO_CONTEXT_MODULE: Record<string, string> = {
  CRM: 'contacts',
  SALES: 'invoicing',
  HR: 'hr',
  INVENTORY: 'inventory',
};

const ENTITY_ACTIONS: Record<ChatEntityType, string[]> = {
  contact: ['Bu müşterinin riskini özetle', 'Bu müşterinin açık teklif ve siparişlerini listele'],
  invoice: ['Bu faturaya ödeme hatırlatma maili hazırla', 'Bu faturanın tahsilat riskini yorumla'],
  sales_quote: ['Bu teklif neden düşük kârlı?', 'Bu teklif için iskonto ve marj uyarılarını çıkar'],
  sales_order: ['Bu siparişin teslimat ve fatura riskini özetle'],
  employee: ['Bu personelin eksik evraklarını çıkar', 'Bu personelin son izin ve puantaj durumunu özetle'],
  product: ['Bu ürünün stok uygunluğunu özetle', 'Bu ürünün son satış fiyatlarını yorumla'],
};

function hasReadPermission(permissions: ChatPermissionSet, module: string): boolean {
  return permissions.isOwner || permissions.modules.some((permission) => permission.module === module && permission.action === 'READ');
}

function hasTenantModule(tenantModules: string[], module: string): boolean {
  const activeModules = tenantModules.map((tenantModule) => TENANT_MODULE_TO_CONTEXT_MODULE[tenantModule.toUpperCase()] ?? tenantModule.toLowerCase());
  return activeModules.length === 0 || activeModules.includes(module);
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function calculateMarginPercent(unitPrice: number, discount: number, averageCost: number): number | null {
  const netPrice = unitPrice * (1 - discount / 100);
  if (netPrice <= 0 || averageCost <= 0) return null;
  return ((netPrice - averageCost) / netPrice) * 100;
}

async function loadContactContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const contact = await prisma.contact.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      email: true,
      phone: true,
      creditLimit: true,
      paymentTermDays: true,
      accountEntries: {
        select: { balance: true, date: true },
        orderBy: { date: 'desc' },
        take: 1,
      },
      invoices: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, dueDate: true, totalGross: true },
        orderBy: { date: 'desc' },
        take: 5,
      },
      salesQuotes: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, validUntil: true, totalGross: true },
        orderBy: { date: 'desc' },
        take: 5,
      },
      salesOrders: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, dueDate: true, totalGross: true, invoicedAmount: true },
        orderBy: { date: 'desc' },
        take: 5,
      },
    },
  });

  if (!contact) return null;

  const now = Date.now();
  const invoices = contact.invoices.map((invoice) => ({
    ...invoice,
    totalGross: toNumber(invoice.totalGross),
    daysLate: invoice.dueDate ? Math.max(0, Math.floor((now - invoice.dueDate.getTime()) / 86_400_000)) : 0,
  }));
  const openInvoiceTotal = invoices
    .filter((invoice) => invoice.status !== 'PAID' && invoice.status !== 'CANCELLED')
    .reduce((sum, invoice) => sum + invoice.totalGross, 0);
  const balance = toNumber(contact.accountEntries[0]?.balance);

  return {
    entity: {
      id: contact.id,
      name: contact.name,
      code: contact.code,
      type: contact.type,
      email: contact.email,
      phone: contact.phone,
      creditLimit: contact.creditLimit ? toNumber(contact.creditLimit) : null,
      paymentTermDays: contact.paymentTermDays,
      balance,
      creditLimitExceeded: contact.creditLimit ? balance > toNumber(contact.creditLimit) : false,
    },
    openInvoiceTotal,
    recentInvoices: invoices,
    recentQuotes: contact.salesQuotes.map((quote) => ({ ...quote, totalGross: toNumber(quote.totalGross) })),
    recentOrders: contact.salesOrders.map((order) => ({
      ...order,
      totalGross: toNumber(order.totalGross),
      invoicedAmount: toNumber(order.invoicedAmount),
    })),
  };
}

async function loadInvoiceContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      date: true,
      dueDate: true,
      totalNet: true,
      totalTax: true,
      totalGross: true,
      contact: { select: { id: true, name: true, email: true, paymentTermDays: true } },
      salesOrder: { select: { id: true, number: true, status: true, totalGross: true, invoicedAmount: true } },
      lines: {
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          lineTotal: true,
          product: { select: { code: true, name: true, averageCost: true, salesPrice: true } },
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      },
    },
  });

  if (!invoice) return null;

  return {
    entity: {
      id: invoice.id,
      number: invoice.number,
      type: invoice.type,
      status: invoice.status,
      date: invoice.date,
      dueDate: invoice.dueDate,
      totalNet: toNumber(invoice.totalNet),
      totalTax: toNumber(invoice.totalTax),
      totalGross: toNumber(invoice.totalGross),
      contact: invoice.contact,
      salesOrder: invoice.salesOrder
        ? {
            ...invoice.salesOrder,
            totalGross: toNumber(invoice.salesOrder.totalGross),
            invoicedAmount: toNumber(invoice.salesOrder.invoicedAmount),
          }
        : null,
    },
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      discount: toNumber(line.discount),
      lineTotal: toNumber(line.lineTotal),
      product: line.product
        ? {
            code: line.product.code,
            name: line.product.name,
            averageCost: toNumber(line.product.averageCost),
            salesPrice: toNumber(line.product.salesPrice),
          }
        : null,
    })),
  };
}

async function loadSalesQuoteContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const quote = await prisma.salesQuote.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      date: true,
      validUntil: true,
      totalNet: true,
      totalTax: true,
      totalGross: true,
      contact: { select: { id: true, name: true, email: true, creditLimit: true } },
      salesOrders: { where: { deletedAt: null }, select: { id: true, number: true, status: true, totalGross: true }, take: 3 },
      items: {
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          lineTotal: true,
          product: { select: { code: true, name: true, averageCost: true, salesPrice: true, minStockLevel: true } },
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      },
    },
  });

  if (!quote) return null;

  const items = quote.items.map((item) => {
    const unitPrice = toNumber(item.unitPrice);
    const discount = toNumber(item.discount);
    const averageCost = toNumber(item.product.averageCost);
    return {
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice,
      discount,
      lineTotal: toNumber(item.lineTotal),
      marginPercent: calculateMarginPercent(unitPrice, discount, averageCost),
      product: {
        code: item.product.code,
        name: item.product.name,
        averageCost,
        salesPrice: toNumber(item.product.salesPrice),
        minStockLevel: toNumber(item.product.minStockLevel),
      },
    };
  });

  return {
    entity: {
      id: quote.id,
      number: quote.number,
      status: quote.status,
      date: quote.date,
      validUntil: quote.validUntil,
      totalNet: toNumber(quote.totalNet),
      totalTax: toNumber(quote.totalTax),
      totalGross: toNumber(quote.totalGross),
      contact: quote.contact
        ? { ...quote.contact, creditLimit: quote.contact.creditLimit ? toNumber(quote.contact.creditLimit) : null }
        : null,
    },
    items,
    convertedOrders: quote.salesOrders.map((order) => ({ ...order, totalGross: toNumber(order.totalGross) })),
    lowMarginItems: items.filter((item) => item.marginPercent !== null && item.marginPercent < 15),
  };
}

async function loadSalesOrderContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const order = await prisma.salesOrder.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      date: true,
      dueDate: true,
      totalGross: true,
      invoicedAmount: true,
      contact: { select: { id: true, name: true, email: true } },
      invoices: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, dueDate: true, totalGross: true },
        take: 5,
      },
      items: {
        select: {
          description: true,
          quantity: true,
          delivered: true,
          unitPrice: true,
          lineTotal: true,
          product: { select: { code: true, name: true } },
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      },
    },
  });

  if (!order) return null;

  return {
    entity: {
      id: order.id,
      number: order.number,
      status: order.status,
      date: order.date,
      dueDate: order.dueDate,
      totalGross: toNumber(order.totalGross),
      invoicedAmount: toNumber(order.invoicedAmount),
      remainingToInvoice: Math.max(0, toNumber(order.totalGross) - toNumber(order.invoicedAmount)),
      contact: order.contact,
    },
    invoices: order.invoices.map((invoice) => ({ ...invoice, totalGross: toNumber(invoice.totalGross) })),
    items: order.items.map((item) => ({
      description: item.description,
      quantity: toNumber(item.quantity),
      delivered: toNumber(item.delivered),
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.lineTotal),
      product: item.product,
    })),
  };
}

async function loadEmployeeContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const employee = await prisma.employee.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      position: true,
      department: true,
      hireDate: true,
      leaveDate: true,
      isActive: true,
      leaveRequests: {
        where: { deletedAt: null },
        select: { id: true, type: true, status: true, startDate: true, endDate: true, days: true },
        orderBy: { startDate: 'desc' },
        take: 5,
      },
      attendances: {
        select: { date: true, checkIn: true, checkOut: true, overtimeHours: true },
        orderBy: { date: 'desc' },
        take: 5,
      },
      payrolls: {
        where: { deletedAt: null },
        select: { period: true, grossSalary: true, deductions: true, netSalary: true, paidAt: true },
        orderBy: { period: 'desc' },
        take: 3,
      },
    },
  });

  if (!employee) return null;

  return {
    entity: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      phone: employee.phone,
      position: employee.position,
      department: employee.department,
      hireDate: employee.hireDate,
      leaveDate: employee.leaveDate,
      isActive: employee.isActive,
    },
    recentLeaves: employee.leaveRequests.map((leave) => ({ ...leave, days: toNumber(leave.days) })),
    recentAttendance: employee.attendances.map((attendance) => ({
      ...attendance,
      overtimeHours: toNumber(attendance.overtimeHours),
    })),
    recentPayrolls: employee.payrolls.map((payroll) => ({
      ...payroll,
      grossSalary: toNumber(payroll.grossSalary),
      deductions: toNumber(payroll.deductions),
      netSalary: toNumber(payroll.netSalary),
    })),
    documentNote: 'Bu şemada personel evrak modeli yok; eksik evrak yorumu mevcut personel, izin, puantaj ve bordro verisiyle sınırlıdır.',
  };
}

async function loadProductContext(tenantId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const product = await prisma.product.findFirst({
    where: { tenantId, id: entityId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      salesPrice: true,
      purchasePrice: true,
      averageCost: true,
      minStockLevel: true,
      stockLevels: {
        select: { quantity: true, warehouse: { select: { name: true } } },
        take: 10,
      },
      quoteItems: {
        where: { tenantId, quote: { deletedAt: null } },
        select: { unitPrice: true, discount: true, quantity: true, quote: { select: { number: true, date: true, contact: { select: { name: true } } } } },
        orderBy: { quote: { date: 'desc' } },
        take: 5,
      },
      invoiceLines: {
        where: { tenantId, invoice: { deletedAt: null } },
        select: { unitPrice: true, discount: true, quantity: true, invoice: { select: { number: true, date: true, contact: { select: { name: true } } } } },
        orderBy: { invoice: { date: 'desc' } },
        take: 5,
      },
    },
  });

  if (!product) return null;

  const totalStock = product.stockLevels.reduce((sum, stockLevel) => sum + toNumber(stockLevel.quantity), 0);

  return {
    entity: {
      id: product.id,
      code: product.code,
      name: product.name,
      salesPrice: toNumber(product.salesPrice),
      purchasePrice: toNumber(product.purchasePrice),
      averageCost: toNumber(product.averageCost),
      minStockLevel: toNumber(product.minStockLevel),
      totalStock,
      belowMinStock: totalStock < toNumber(product.minStockLevel),
    },
    stockLevels: product.stockLevels.map((stockLevel) => ({
      warehouse: stockLevel.warehouse.name,
      quantity: toNumber(stockLevel.quantity),
    })),
    recentQuotePrices: product.quoteItems.map((item) => ({
      number: item.quote.number,
      date: item.quote.date,
      contact: item.quote.contact.name,
      unitPrice: toNumber(item.unitPrice),
      discount: toNumber(item.discount),
      quantity: toNumber(item.quantity),
    })),
    recentInvoicePrices: product.invoiceLines.map((line) => ({
      number: line.invoice.number,
      date: line.invoice.date,
      contact: line.invoice.contact.name,
      unitPrice: toNumber(line.unitPrice),
      discount: toNumber(line.discount),
      quantity: toNumber(line.quantity),
    })),
  };
}

export const ChatContextService = {
  async loadEntityContext(
    tenantId: string,
    permissions: ChatPermissionSet,
    tenantModules: string[],
    context?: ChatPageContext,
  ): Promise<LoadedChatEntityContext | null> {
    if (!context?.entityType || !context.entityId) return null;

    const requiredModule = ENTITY_MODULES[context.entityType];
    if (!hasTenantModule(tenantModules, requiredModule)) {
      return {
        allowed: false,
        entityType: context.entityType,
        suggestedActions: [],
        message: 'Aktif kayıt bağlamı için tenant modülü kapalı.',
      };
    }

    if (!hasReadPermission(permissions, requiredModule)) {
      return {
        allowed: false,
        entityType: context.entityType,
        suggestedActions: [],
        message: 'Aktif kayıt bağlamı için okuma yetkisi yok.',
      };
    }

    let summary: Record<string, unknown> | null = null;
    if (context.entityType === 'contact') summary = await loadContactContext(tenantId, context.entityId);
    if (context.entityType === 'invoice') summary = await loadInvoiceContext(tenantId, context.entityId);
    if (context.entityType === 'sales_quote') summary = await loadSalesQuoteContext(tenantId, context.entityId);
    if (context.entityType === 'sales_order') summary = await loadSalesOrderContext(tenantId, context.entityId);
    if (context.entityType === 'employee') summary = await loadEmployeeContext(tenantId, context.entityId);
    if (context.entityType === 'product') summary = await loadProductContext(tenantId, context.entityId);

    if (!summary) {
      return {
        allowed: true,
        entityType: context.entityType,
        suggestedActions: ENTITY_ACTIONS[context.entityType],
        message: 'Aktif kayıt bulunamadı veya silinmiş.',
      };
    }

    return {
      allowed: true,
      entityType: context.entityType,
      summary,
      suggestedActions: ENTITY_ACTIONS[context.entityType],
    };
  },
};

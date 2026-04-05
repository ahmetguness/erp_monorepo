import { Hono } from 'hono';
import { authenticateApiKey, requireScope } from '../middleware/authenticateApiKey';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';

const externalRoutes = new Hono();

externalRoutes.use('*', authenticateApiKey());

// ═══════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════

externalRoutes.get('/products', requireScope('products:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where: { tenantId, deletedAt: null } }),
    prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, code: true, name: true, barcode: true,
        purchasePrice: true, salesPrice: true, averageCost: true,
        isActive: true, createdAt: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, code: true } },
      },
      orderBy: { code: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return c.json({ data: products, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

externalRoutes.get('/products/:id', requireScope('products:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const product = await prisma.product.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: {
      id: true, code: true, name: true, barcode: true, description: true,
      purchasePrice: true, salesPrice: true, averageCost: true, minStockLevel: true,
      isActive: true, createdAt: true, updatedAt: true,
      category: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, code: true } },
      taxRate: { select: { id: true, name: true, rate: true } },
    },
  });

  if (!product) return c.json({ error: 'Ürün bulunamadı.' }, 404);
  return c.json({ data: product });
});

externalRoutes.post('/products', requireScope('products:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{
    code: string; name: string; unitId: string;
    barcode?: string; description?: string; categoryId?: string; taxRateId?: string;
    purchasePrice?: number; salesPrice?: number; minStockLevel?: number;
  }>();

  if (!body.code || !body.name || !body.unitId) {
    return c.json(new ValidationError('code, name ve unitId zorunludur.').toJSON(), 400);
  }

  const product = await prisma.product.create({
    data: {
      tenantId, code: body.code, name: body.name, unitId: body.unitId,
      barcode: body.barcode ?? null, description: body.description ?? null,
      categoryId: body.categoryId ?? null, taxRateId: body.taxRateId ?? null,
      purchasePrice: body.purchasePrice ?? 0, salesPrice: body.salesPrice ?? 0,
      minStockLevel: body.minStockLevel ?? 0,
    },
    select: { id: true, code: true, name: true, createdAt: true },
  });

  return c.json({ data: product }, 201);
});

externalRoutes.patch('/products/:id', requireScope('products:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;
  const body = await c.req.json<{
    name?: string; barcode?: string; description?: string;
    purchasePrice?: number; salesPrice?: number; minStockLevel?: number; isActive?: boolean;
  }>();

  const existing = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) return c.json({ error: 'Ürün bulunamadı.' }, 404);

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.barcode !== undefined && { barcode: body.barcode }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.purchasePrice !== undefined && { purchasePrice: body.purchasePrice }),
      ...(body.salesPrice !== undefined && { salesPrice: body.salesPrice }),
      ...(body.minStockLevel !== undefined && { minStockLevel: body.minStockLevel }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    select: { id: true, code: true, name: true, updatedAt: true },
  });

  return c.json({ data: updated });
});

externalRoutes.delete('/products/:id', requireScope('products:delete'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const existing = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) return c.json({ error: 'Ürün bulunamadı.' }, 404);

  await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ data: { success: true } });
});

// ═══════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════

externalRoutes.get('/contacts', requireScope('contacts:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

  const [total, contacts] = await prisma.$transaction([
    prisma.contact.count({ where: { tenantId, deletedAt: null } }),
    prisma.contact.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, type: true, code: true, name: true,
        taxNumber: true, email: true, phone: true, city: true,
        isActive: true, createdAt: true, updatedAt: true,
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return c.json({ data: contacts, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

externalRoutes.get('/contacts/:id', requireScope('contacts:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: {
      id: true, type: true, code: true, name: true,
      taxNumber: true, taxOffice: true, email: true, phone: true,
      address: true, city: true, country: true, notes: true,
      creditLimit: true, paymentTermDays: true,
      isActive: true, createdAt: true, updatedAt: true,
    },
  });

  if (!contact) return c.json({ error: 'Cari hesap bulunamadı.' }, 404);
  return c.json({ data: contact });
});

externalRoutes.post('/contacts', requireScope('contacts:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{
    type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'; name: string;
    code?: string; taxNumber?: string; taxOffice?: string;
    email?: string; phone?: string; address?: string; city?: string;
    creditLimit?: number; paymentTermDays?: number;
  }>();

  if (!body.type || !body.name) {
    return c.json(new ValidationError('type ve name zorunludur.').toJSON(), 400);
  }

  const contact = await prisma.contact.create({
    data: {
      tenantId, type: body.type, name: body.name,
      code: body.code ?? null, taxNumber: body.taxNumber ?? null,
      taxOffice: body.taxOffice ?? null, email: body.email ?? null,
      phone: body.phone ?? null, address: body.address ?? null,
      city: body.city ?? null, creditLimit: body.creditLimit ?? null,
      paymentTermDays: body.paymentTermDays ?? null,
    },
    select: { id: true, type: true, code: true, name: true, createdAt: true },
  });

  return c.json({ data: contact }, 201);
});

externalRoutes.patch('/contacts/:id', requireScope('contacts:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;
  const body = await c.req.json<{
    name?: string; email?: string; phone?: string; address?: string; city?: string;
    creditLimit?: number; paymentTermDays?: number; isActive?: boolean;
  }>();

  const existing = await prisma.contact.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) return c.json({ error: 'Cari hesap bulunamadı.' }, 404);

  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.city !== undefined && { city: body.city }),
      ...(body.creditLimit !== undefined && { creditLimit: body.creditLimit }),
      ...(body.paymentTermDays !== undefined && { paymentTermDays: body.paymentTermDays }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    select: { id: true, code: true, name: true, updatedAt: true },
  });

  return c.json({ data: updated });
});

externalRoutes.delete('/contacts/:id', requireScope('contacts:delete'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const existing = await prisma.contact.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) return c.json({ error: 'Cari hesap bulunamadı.' }, 404);

  await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ data: { success: true } });
});

// ═══════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════

externalRoutes.get('/invoices', requireScope('invoices:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

  const [total, invoices] = await prisma.$transaction([
    prisma.invoice.count({ where: { tenantId, deletedAt: null } }),
    prisma.invoice.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, number: true, type: true, status: true,
        date: true, dueDate: true,
        totalNet: true, totalTax: true, totalGross: true,
        currencyCode: true, createdAt: true, updatedAt: true,
        contact: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return c.json({ data: invoices, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

externalRoutes.get('/invoices/:id', requireScope('invoices:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: {
      id: true, number: true, type: true, status: true,
      date: true, dueDate: true, notes: true,
      totalNet: true, totalTax: true, totalGross: true,
      currencyCode: true, exchangeRate: true,
      createdAt: true, updatedAt: true,
      contact: { select: { id: true, name: true, code: true } },
      lines: {
        select: {
          id: true, description: true, quantity: true, unitPrice: true,
          discount: true, taxAmount: true, lineTotal: true,
          product: { select: { id: true, code: true, name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!invoice) return c.json({ error: 'Fatura bulunamadı.' }, 404);
  return c.json({ data: invoice });
});

externalRoutes.post('/invoices', requireScope('invoices:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{
    contactId: string; type: 'SALES' | 'PURCHASE'; number: string;
    date: string; dueDate?: string; notes?: string; currencyCode?: string;
    lines: Array<{
      description: string; quantity: number; unitPrice: number;
      productId?: string; taxRateId?: string; discount?: number;
    }>;
  }>();

  if (!body.contactId || !body.type || !body.number || !body.date || !body.lines?.length) {
    return c.json(new ValidationError('contactId, type, number, date ve en az bir satır zorunludur.').toJSON(), 400);
  }

  // Calculate totals
  let totalNet = 0;
  let totalTax = 0;
  const lineData = body.lines.map((line, i) => {
    const discount = line.discount ?? 0;
    const net = line.quantity * line.unitPrice * (1 - discount / 100);
    // Tax will be calculated if taxRateId is provided, for now estimate 0
    totalNet += net;
    return {
      tenantId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount,
      taxAmount: 0,
      lineTotal: net,
      productId: line.productId ?? null,
      taxRateId: line.taxRateId ?? null,
      sortOrder: i,
    };
  });

  const totalGross = totalNet + totalTax;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId, contactId: body.contactId, type: body.type,
      number: body.number, date: new Date(body.date),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null, currencyCode: body.currencyCode ?? 'TRY',
      totalNet, totalTax, totalGross,
      lines: { create: lineData },
    },
    select: { id: true, number: true, type: true, status: true, totalGross: true, createdAt: true },
  });

  return c.json({ data: invoice }, 201);
});

externalRoutes.post('/invoices/:id/cancel', requireScope('invoices:delete'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id')!;

  const existing = await prisma.invoice.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) return c.json({ error: 'Fatura bulunamadı.' }, 404);
  if (existing.status === 'CANCELLED') return c.json({ error: 'Fatura zaten iptal edilmiş.' }, 400);

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: 'CANCELLED' },
    select: { id: true, number: true, status: true, updatedAt: true },
  });

  return c.json({ data: updated });
});

// ═══════════════════════════════════════════
// STOCK
// ═══════════════════════════════════════════

externalRoutes.get('/stock-levels', requireScope('products:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));

  const [total, levels] = await prisma.$transaction([
    prisma.stockLevel.count({ where: { tenantId } }),
    prisma.stockLevel.findMany({
      where: { tenantId },
      select: {
        id: true, quantity: true,
        product: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return c.json({ data: levels, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

externalRoutes.post('/stock-movements', requireScope('products:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{
    productId: string; type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number; toWarehouseId?: string; fromWarehouseId?: string; notes?: string;
  }>();

  if (!body.productId || !body.type || !body.quantity) {
    return c.json(new ValidationError('productId, type ve quantity zorunludur.').toJSON(), 400);
  }

  const movement = await prisma.stockMovement.create({
    data: {
      tenantId, productId: body.productId,
      type: body.type, quantity: body.quantity,
      toWarehouseId: body.toWarehouseId ?? null,
      fromWarehouseId: body.fromWarehouseId ?? null,
      notes: body.notes ?? null,
    },
    select: { id: true, type: true, quantity: true, createdAt: true },
  });

  return c.json({ data: movement }, 201);
});

// ═══════════════════════════════════════════
// WEBHOOKS / ORDERS (read-only for now)
// ═══════════════════════════════════════════

externalRoutes.get('/sales-orders', requireScope('orders:read'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));

  const [total, orders] = await prisma.$transaction([
    prisma.salesOrder.count({ where: { tenantId, deletedAt: null } }),
    prisma.salesOrder.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, number: true, status: true, date: true, dueDate: true,
        totalNet: true, totalTax: true, totalGross: true,
        createdAt: true, updatedAt: true,
        contact: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return c.json({ data: orders, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

externalRoutes.post('/sales-orders', requireScope('orders:write'), async (c) => {
  const tenantId = c.get('tenantId') as string;
  const body = await c.req.json<{
    contactId: string; number: string; date: string; dueDate?: string; notes?: string;
    items: Array<{
      productId: string; description: string; quantity: number; unitPrice: number;
      discount?: number; taxRate?: number;
    }>;
  }>();

  if (!body.contactId || !body.number || !body.date || !body.items?.length) {
    return c.json(new ValidationError('contactId, number, date ve en az bir kalem zorunludur.').toJSON(), 400);
  }

  let totalNet = 0;
  let totalTax = 0;
  const itemData = body.items.map((item, i) => {
    const discount = item.discount ?? 0;
    const taxRate = item.taxRate ?? 0;
    const net = item.quantity * item.unitPrice * (1 - discount / 100);
    const tax = net * taxRate / 100;
    totalNet += net;
    totalTax += tax;
    return {
      tenantId, productId: item.productId, description: item.description,
      quantity: item.quantity, unitPrice: item.unitPrice,
      discount, taxRate, taxAmount: tax, lineTotal: net + tax, sortOrder: i,
    };
  });

  const order = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: body.contactId, number: body.number,
      date: new Date(body.date), dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null,
      totalNet, totalTax, totalGross: totalNet + totalTax,
      items: { create: itemData },
    },
    select: { id: true, number: true, status: true, totalGross: true, createdAt: true },
  });

  return c.json({ data: order }, 201);
});

export { externalRoutes };

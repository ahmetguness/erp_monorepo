import { Context } from 'hono';
import { PermissionAction, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getTenantPermissionContext } from '../lib/tenant-permissions';
import { ForbiddenError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

type SearchResultType = 'product' | 'contact' | 'invoice' | 'sales_order' | 'purchase_order' | 'payment' | 'stock_movement';

interface SearchResult {
  id: string;
  type: SearchResultType;
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
}

function parseLimit(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function textContains(query: string): Prisma.StringFilter {
  return { contains: query, mode: 'insensitive' };
}

export const SearchController = {
  async global(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const query = (c.req.query('q') ?? '').trim();
    const limit = parseLimit(c.req.query('limit'));

    if (query.length < 2) {
      return c.json({ data: [], meta: { query, total: 0 } });
    }

    const permissions = await getTenantPermissionContext(tenantId, userId);
    if (!permissions) {
      return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
    }

    const results: SearchResult[] = [];

    if (permissions.can(PermissionAction.READ, 'inventory')) {
      const [products, movements] = await Promise.all([
        prisma.product.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ code: textContains(query) }, { name: textContains(query) }, { barcode: textContains(query) }],
          },
          select: { id: true, code: true, name: true, barcode: true },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
        prisma.stockMovement.findMany({
          where: {
            tenantId,
            OR: [{ notes: textContains(query) }, { refId: textContains(query) }],
          },
          select: {
            id: true,
            type: true,
            quantity: true,
            refType: true,
            refId: true,
            createdAt: true,
            product: { select: { code: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ]);

      results.push(
        ...products.map((product): SearchResult => ({
          id: product.id,
          type: 'product',
          module: 'inventory',
          title: `${product.code} - ${product.name}`,
          subtitle: product.barcode ? `Barkod: ${product.barcode}` : 'Urun',
          href: `/dashboard/products/${product.id}`,
        })),
        ...movements.map((movement): SearchResult => ({
          id: movement.id,
          type: 'stock_movement',
          module: 'inventory',
          title: `${movement.product.code} - ${movement.product.name}`,
          subtitle: `${movement.type} - ${Number(movement.quantity).toFixed(3)}${movement.refType ? ` - ${movement.refType}` : ''}`,
          href: '/dashboard/stock/movements',
        })),
      );
    }

    if (permissions.can(PermissionAction.READ, 'contacts')) {
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: textContains(query) },
            { code: textContains(query) },
            { taxNumber: textContains(query) },
            { email: textContains(query) },
            { phone: textContains(query) },
          ],
        },
        select: { id: true, name: true, code: true, type: true, email: true, phone: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      results.push(...contacts.map((contact): SearchResult => ({
        id: contact.id,
        type: 'contact',
        module: 'contacts',
        title: contact.code ? `${contact.code} - ${contact.name}` : contact.name,
        subtitle: [contact.type, contact.email, contact.phone].filter(Boolean).join(' - ') || null,
        href: `/dashboard/contacts/${contact.id}`,
      })));
    }

    if (permissions.can(PermissionAction.READ, 'invoicing')) {
      const [invoices, salesOrders] = await Promise.all([
        prisma.invoice.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ number: textContains(query) }, { contact: { name: textContains(query) } }],
          },
          select: { id: true, number: true, type: true, status: true, totalGross: true, contact: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: limit,
        }),
        prisma.salesOrder.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ number: textContains(query) }, { contact: { name: textContains(query) } }],
          },
          select: { id: true, number: true, status: true, totalGross: true, contact: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: limit,
        }),
      ]);

      results.push(
        ...invoices.map((invoice): SearchResult => ({
          id: invoice.id,
          type: 'invoice',
          module: 'invoicing',
          title: `${invoice.number} - ${invoice.contact.name}`,
          subtitle: `${invoice.type} - ${invoice.status} - ${Number(invoice.totalGross).toFixed(2)} TRY`,
          href: `/dashboard/invoices/${invoice.id}`,
        })),
        ...salesOrders.map((order): SearchResult => ({
          id: order.id,
          type: 'sales_order',
          module: 'invoicing',
          title: `${order.number} - ${order.contact.name}`,
          subtitle: `${order.status} - ${Number(order.totalGross).toFixed(2)} TRY`,
          href: `/dashboard/sales-orders/${order.id}`,
        })),
      );
    }

    if (permissions.can(PermissionAction.READ, 'purchasing')) {
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ number: textContains(query) }, { contact: { name: textContains(query) } }],
        },
        select: { id: true, number: true, status: true, totalGross: true, contact: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: limit,
      });

      results.push(...purchaseOrders.map((order): SearchResult => ({
        id: order.id,
        type: 'purchase_order',
        module: 'purchasing',
        title: `${order.number} - ${order.contact.name}`,
        subtitle: `${order.status} - ${Number(order.totalGross).toFixed(2)} TRY`,
        href: `/dashboard/purchase-orders/${order.id}`,
      })));
    }

    if (permissions.can(PermissionAction.READ, 'accounting')) {
      const payments = await prisma.payment.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ reference: textContains(query) }, { notes: textContains(query) }, { contact: { name: textContains(query) } }],
        },
        select: { id: true, reference: true, method: true, status: true, amount: true, contact: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: limit,
      });

      results.push(...payments.map((payment): SearchResult => ({
        id: payment.id,
        type: 'payment',
        module: 'accounting',
        title: payment.reference ? `${payment.reference} - ${payment.contact?.name ?? 'Odeme'}` : payment.contact?.name ?? 'Odeme',
        subtitle: `${payment.method} - ${payment.status} - ${Number(payment.amount).toFixed(2)} TRY`,
        href: '/dashboard/payments',
      })));
    }

    return c.json({
      data: results.slice(0, limit),
      meta: { query, total: results.length },
    });
  },
};

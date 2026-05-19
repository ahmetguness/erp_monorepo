import { Context } from 'hono';
import { EntityType, MailDeliveryStatus, PermissionAction, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getTenantPermissionContext } from '../lib/tenant-permissions';
import { ForbiddenError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

type SearchResultType =
  | 'product'
  | 'contact'
  | 'invoice'
  | 'sales_quote'
  | 'sales_order'
  | 'purchase_order'
  | 'payment'
  | 'stock_movement'
  | 'mail'
  | 'employee'
  | 'service_request'
  | 'document'
  | 'task'
  | 'action';

type SearchResultKind = 'record' | 'action';

interface SearchResultMeta {
  label: string;
  value: string;
}

interface SearchResult {
  id: string;
  type: SearchResultType;
  kind: SearchResultKind;
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
  status: string | null;
  date: string | null;
  amount: string | null;
  meta: SearchResultMeta[];
}

function parseLimit(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function textContains(query: string): Prisma.StringFilter {
  return { contains: query, mode: 'insensitive' };
}

function money(value: Prisma.Decimal): string {
  return `${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRY`;
}

function dateValue(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function result(input: Omit<SearchResult, 'kind' | 'status' | 'date' | 'amount' | 'meta'> & Partial<Pick<SearchResult, 'kind' | 'status' | 'date' | 'amount' | 'meta'>>): SearchResult {
  return {
    kind: input.kind ?? 'record',
    status: input.status ?? null,
    date: input.date ?? null,
    amount: input.amount ?? null,
    meta: input.meta ?? [],
    ...input,
  };
}

function actionResult(input: { id: string; module: string; title: string; subtitle: string; href: string }): SearchResult {
  return result({
    id: input.id,
    type: 'action',
    kind: 'action',
    module: input.module,
    title: input.title,
    subtitle: input.subtitle,
    href: input.href,
  });
}

function entityHref(entityType: EntityType, entityId: string): string {
  switch (entityType) {
    case EntityType.CONTACT:
      return `/dashboard/contacts/${entityId}`;
    case EntityType.EMPLOYEE:
      return `/dashboard/hr/employees/${entityId}`;
    case EntityType.INVOICE:
      return `/dashboard/invoices/${entityId}`;
    case EntityType.SALES_QUOTE:
      return `/dashboard/sales-orders/quotes/${entityId}`;
    case EntityType.SALES_ORDER:
      return `/dashboard/sales-orders/${entityId}`;
    case EntityType.PURCHASE_ORDER:
      return `/dashboard/purchase-orders/${entityId}`;
    case EntityType.PRODUCT:
      return `/dashboard/products/${entityId}`;
    case EntityType.SERVICE_REQUEST:
      return `/dashboard/service/requests/${entityId}`;
    case EntityType.WORK_ORDER:
      return `/dashboard/production/work-orders/${entityId}`;
    case EntityType.DELIVERY_NOTE:
      return '/dashboard/delivery-notes';
    case EntityType.CUSTOMER_ASSET:
      return '/dashboard/service/assets';
    case EntityType.CATEGORY:
    case EntityType.OTHER:
      return '/dashboard/documents';
  }
}

async function getTenantUserEmail(tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  return tenantUser?.user.email ?? null;
}

function visibleMailWhere(userId: string, email: string): Prisma.MailMessageWhereInput {
  return {
    OR: [
      { sentById: userId },
      { to: { has: email } },
      { cc: { has: email } },
      { bcc: { has: email } },
    ],
  };
}

function buildActions(can: (action: PermissionAction, module: string) => boolean): SearchResult[] {
  const actions: SearchResult[] = [];
  if (can(PermissionAction.CREATE, 'sales') || can(PermissionAction.CREATE, 'invoicing')) {
    actions.push(actionResult({ id: 'new-sales-quote', module: 'sales', title: 'Yeni teklif oluştur', subtitle: 'Satış teklifi formunu aç', href: '/dashboard/sales-orders/quotes/new' }));
  }
  if (can(PermissionAction.CREATE, 'contacts')) {
    actions.push(actionResult({ id: 'new-contact', module: 'contacts', title: 'Yeni müşteri / cari', subtitle: 'Cari kartı oluştur', href: '/dashboard/contacts/new' }));
  }
  if (can(PermissionAction.CREATE, 'accounting')) {
    actions.push(actionResult({ id: 'new-payment', module: 'accounting', title: 'Ödeme ekle', subtitle: 'Tahsilat veya ödeme kaydı oluştur', href: '/dashboard/payments/new' }));
  }
  if (can(PermissionAction.CREATE, 'mail')) {
    actions.push(actionResult({ id: 'send-mail', module: 'mail', title: 'Mail gönder', subtitle: 'Mail Merkezi’ni aç', href: '/dashboard/mail' }));
  }
  actions.push(actionResult({ id: 'create-task', module: 'workflow', title: 'Görev oluştur', subtitle: 'İş Akışı Merkezi’ne git', href: '/dashboard/workflow' }));
  return actions;
}

function matchesAction(action: SearchResult, query: string): boolean {
  const normalized = query.toLocaleLowerCase('tr-TR');
  return `${action.title} ${action.subtitle ?? ''}`.toLocaleLowerCase('tr-TR').includes(normalized);
}

export const SearchController = {
  async global(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const query = (c.req.query('q') ?? '').trim();
    const limit = parseLimit(c.req.query('limit'));

    const permissions = await getTenantPermissionContext(tenantId, userId);
    if (!permissions) {
      return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
    }

    const can = (action: PermissionAction, module: string): boolean => permissions.can(action, module);
    const quickActions = buildActions(can);
    const results: SearchResult[] = query.length < 2 ? quickActions : quickActions.filter((action) => matchesAction(action, query));

    if (query.length < 2) {
      return c.json({ data: results.slice(0, limit), meta: { query, total: results.length } });
    }

    if (can(PermissionAction.READ, 'inventory')) {
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
        ...products.map((product): SearchResult => result({
          id: product.id,
          type: 'product',
          module: 'inventory',
          title: `${product.code} - ${product.name}`,
          subtitle: product.barcode ? `Barkod: ${product.barcode}` : 'Ürün',
          href: `/dashboard/products/${product.id}`,
          meta: [{ label: 'Kod', value: product.code }],
        })),
        ...movements.map((movement): SearchResult => result({
          id: movement.id,
          type: 'stock_movement',
          module: 'inventory',
          title: `${movement.product.code} - ${movement.product.name}`,
          subtitle: `${movement.type} - ${Number(movement.quantity).toFixed(3)}${movement.refType ? ` - ${movement.refType}` : ''}`,
          href: '/dashboard/stock/movements',
          status: movement.type,
          date: dateValue(movement.createdAt),
          meta: [{ label: 'Miktar', value: Number(movement.quantity).toFixed(3) }],
        })),
      );
    }

    if (can(PermissionAction.READ, 'contacts')) {
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

      results.push(...contacts.map((contact): SearchResult => result({
        id: contact.id,
        type: 'contact',
        module: 'contacts',
        title: contact.code ? `${contact.code} - ${contact.name}` : contact.name,
        subtitle: [contact.type, contact.email, contact.phone].filter(Boolean).join(' - ') || null,
        href: `/dashboard/contacts/${contact.id}`,
        status: contact.type,
      })));
    }

    if (can(PermissionAction.READ, 'invoicing')) {
      const [invoices, salesQuotes, salesOrders] = await Promise.all([
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
        prisma.salesQuote.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ number: textContains(query) }, { contact: { name: textContains(query) } }],
          },
          select: { id: true, number: true, status: true, totalGross: true, validUntil: true, contact: { select: { name: true } } },
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
        ...invoices.map((invoice): SearchResult => result({
          id: invoice.id,
          type: 'invoice',
          module: 'invoicing',
          title: `${invoice.number} - ${invoice.contact.name}`,
          subtitle: `${invoice.type} - ${invoice.status} - ${Number(invoice.totalGross).toFixed(2)} TRY`,
          href: `/dashboard/invoices/${invoice.id}`,
          status: invoice.status,
          amount: money(invoice.totalGross),
        })),
        ...salesQuotes.map((quote): SearchResult => result({
          id: quote.id,
          type: 'sales_quote',
          module: 'invoicing',
          title: `${quote.number} - ${quote.contact.name}`,
          subtitle: `${quote.status} - ${Number(quote.totalGross).toFixed(2)} TRY`,
          href: `/dashboard/sales-orders/quotes/${quote.id}`,
          status: quote.status,
          date: dateValue(quote.validUntil),
          amount: money(quote.totalGross),
        })),
        ...salesOrders.map((order): SearchResult => result({
          id: order.id,
          type: 'sales_order',
          module: 'invoicing',
          title: `${order.number} - ${order.contact.name}`,
          subtitle: `${order.status} - ${Number(order.totalGross).toFixed(2)} TRY`,
          href: `/dashboard/sales-orders/${order.id}`,
          status: order.status,
          amount: money(order.totalGross),
        })),
      );
    }

    if (can(PermissionAction.READ, 'purchasing')) {
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

      results.push(...purchaseOrders.map((order): SearchResult => result({
        id: order.id,
        type: 'purchase_order',
        module: 'purchasing',
        title: `${order.number} - ${order.contact.name}`,
        subtitle: `${order.status} - ${Number(order.totalGross).toFixed(2)} TRY`,
        href: `/dashboard/purchase-orders/${order.id}`,
        status: order.status,
        amount: money(order.totalGross),
      })));
    }

    if (can(PermissionAction.READ, 'accounting')) {
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

      results.push(...payments.map((payment): SearchResult => result({
        id: payment.id,
        type: 'payment',
        module: 'accounting',
        title: payment.reference ? `${payment.reference} - ${payment.contact?.name ?? 'Ödeme'}` : payment.contact?.name ?? 'Ödeme',
        subtitle: `${payment.method} - ${payment.status} - ${Number(payment.amount).toFixed(2)} TRY`,
        href: '/dashboard/payments',
        status: payment.status,
        amount: money(payment.amount),
      })));
    }

    if (can(PermissionAction.READ, 'hr')) {
      const employees = await prisma.employee.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ firstName: textContains(query) }, { lastName: textContains(query) }, { email: textContains(query) }, { department: textContains(query) }, { position: textContains(query) }],
        },
        select: { id: true, firstName: true, lastName: true, email: true, department: true, position: true, isActive: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: limit,
      });

      results.push(...employees.map((employee): SearchResult => result({
        id: employee.id,
        type: 'employee',
        module: 'hr',
        title: `${employee.firstName} ${employee.lastName}`,
        subtitle: [employee.position, employee.department, employee.email].filter(Boolean).join(' - ') || null,
        href: `/dashboard/hr/employees/${employee.id}`,
        status: employee.isActive ? 'Aktif' : 'Pasif',
      })));
    }

    if (can(PermissionAction.READ, 'service')) {
      const serviceRequests = await prisma.serviceRequest.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ number: textContains(query) }, { subject: textContains(query) }, { description: textContains(query) }, { contact: { name: textContains(query) } }],
        },
        select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true, contact: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      results.push(...serviceRequests.map((request): SearchResult => result({
        id: request.id,
        type: 'service_request',
        module: 'service',
        title: `${request.number} - ${request.subject}`,
        subtitle: [request.contact?.name, request.priority].filter(Boolean).join(' - ') || null,
        href: `/dashboard/service/requests/${request.id}`,
        status: request.status,
        date: dateValue(request.createdAt),
      })));
    }

    if (can(PermissionAction.READ, 'mail')) {
      const email = await getTenantUserEmail(tenantId, userId);
      const mails = email
        ? await prisma.mailMessage.findMany({
            where: {
              tenantId,
              ...visibleMailWhere(userId, email),
              OR: [{ subject: textContains(query) }, { from: textContains(query) }, { replyTo: textContains(query) }, { textPreview: textContains(query) }],
            },
            select: { id: true, direction: true, status: true, subject: true, from: true, to: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : [];

      results.push(...mails.map((mail): SearchResult => result({
        id: mail.id,
        type: 'mail',
        module: 'mail',
        title: mail.subject,
        subtitle: mail.direction === 'OUTBOUND' ? `Kime: ${mail.to.slice(0, 2).join(', ')}` : `Kimden: ${mail.from ?? '-'}`,
        href: '/dashboard/mail',
        status: mail.status === MailDeliveryStatus.FAILED ? 'Başarısız' : mail.status,
        date: dateValue(mail.createdAt),
      })));
    }

    if (can(PermissionAction.READ, 'attachments')) {
      const attachments = await prisma.attachment.findMany({
        where: {
          tenantId,
          OR: [{ fileName: textContains(query) }, { category: textContains(query) }, { documentKind: textContains(query) }, { tags: { has: query } }],
        },
        select: { id: true, fileName: true, category: true, entityType: true, entityId: true, createdAt: true, version: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      results.push(...attachments.map((attachment): SearchResult => result({
        id: attachment.id,
        type: 'document',
        module: 'attachments',
        title: attachment.fileName,
        subtitle: attachment.category ?? 'Doküman',
        href: entityHref(attachment.entityType, attachment.entityId),
        date: dateValue(attachment.createdAt),
        meta: [{ label: 'Versiyon', value: `v${attachment.version}` }],
      })));
    }

    const tasks = await prisma.task.findMany({
      where: {
        tenantId,
        OR: [
          { assignedToId: userId },
          { assignedToId: null },
          { createdById: userId },
        ],
        AND: [{ OR: [{ title: textContains(query) }, { detail: textContains(query) }, { module: textContains(query) }] }],
      },
      select: { id: true, title: true, detail: true, type: true, priority: true, status: true, dueAt: true, href: true, module: true },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    results.push(...tasks.map((task): SearchResult => result({
      id: task.id,
      type: 'task',
      module: task.module ?? 'workflow',
      title: task.title,
      subtitle: task.detail,
      href: task.href ?? '/dashboard/workflow',
      status: task.status,
      date: dateValue(task.dueAt),
      meta: [{ label: 'Öncelik', value: task.priority }, { label: 'Tip', value: task.type }],
    })));

    return c.json({
      data: results.slice(0, limit),
      meta: { query, total: results.length },
    });
  },
};

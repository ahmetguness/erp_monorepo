import { Prisma, PrismaClient } from '@prisma/client';
import { recordSlowQuery } from '../services/observability.service.js';
import { getTenantIsolationBypassReason } from './tenant-isolation-context.js';

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaLogLevels: Prisma.PrismaClientOptions['log'] =
  process.env.PRISMA_QUERY_LOG === 'true'
    ? ['query', 'error', 'warn']
    : process.env.NODE_ENV === 'production'
      ? ['error']
      : ['error', 'warn'];

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  });

const tenantScopedModels = new Set([
  'TenantUser',
  'Role',
  'NumberSequence',
  'TenantSetting',
  'ModuleSetting',
  'TenantFeatureOverride',
  'ApiKey',
  'AuditLog',
  'AiRequestLog',
  'Attachment',
  'Notification',
  'MailMessage',
  'Task',
  'AutomationRule',
  'ApprovalFlow',
  'ApprovalRequest',
  'Unit',
  'Category',
  'TaxRate',
  'Currency',
  'CurrencyRate',
  'Contact',
  'AccountEntry',
  'Product',
  'Warehouse',
  'Location',
  'StockLevel',
  'StockMovement',
  'StockValuation',
  'StockCount',
  'StockCountItem',
  'InventoryReservation',
  'ProductBatch',
  'LotSerialNumber',
  'SalesQuote',
  'SalesQuoteItem',
  'SalesOrder',
  'SalesOrderItem',
  'SalesOrderHistory',
  'PurchaseRequest',
  'PurchaseRequestItem',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'PurchaseOrderHistory',
  'DeliveryNote',
  'DeliveryNoteItem',
  'Invoice',
  'InvoiceLine',
  'InvoiceHistory',
  'EDocument',
  'BankAccount',
  'CashAccount',
  'BankTransaction',
  'CheckPromissoryNote',
  'Payment',
  'PaymentAllocation',
  'LedgerAccount',
  'FiscalPeriod',
  'JournalEntry',
  'JournalEntryLine',
  'Reconciliation',
  'ReconciliationLine',
  'Employee',
  'LeaveRequest',
  'Attendance',
  'Payroll',
  'PayrollItem',
  'WorkCenter',
  'BOM',
  'BOMItem',
  'RoutingOperation',
  'WorkOrder',
  'WorkOrderItem',
  'WorkOrderOperation',
  'WorkOrderHistory',
  'WorkCenterCapacity',
  'CustomerAsset',
  'ServiceRequest',
  'ServiceRequestItem',
  'ServiceActivity',
  'ServiceRequestHistory',
  'MarketplaceIntegration',
  'MarketplaceListing',
  'MarketplaceOrder',
  'MarketplaceOrderItem',
  'MarketplaceSyncJob',
  'MarketplaceWebhookEvent',
  'MarketplaceListingSnapshot',
  'SavedReport',
  'SavedView',
  'DomainEventOutbox',
  'DemoRequest',
  'Invitation',
  'CollectionReminder',
]);

const tenantScopedReadActions = new Set(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy']);

function containsTenantId(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsTenantId);
  if (Object.prototype.hasOwnProperty.call(value, 'tenantId')) return true;

  return Object.values(value).some(containsTenantId);
}

function assertTenantScopedRead(params: Prisma.MiddlewareParams): void {
  if (!params.model || !tenantScopedModels.has(params.model)) return;
  if (!tenantScopedReadActions.has(params.action)) return;
  if (getTenantIsolationBypassReason()) return;
  if (containsTenantId(params.args?.where)) return;

  throw new Error(
    `Tenant isolation violation: ${params.model}.${params.action} must include tenantId in where, or run inside an explicit tenant isolation bypass.`,
  );
}

// Soft delete guard.
// Prevent tenant hard deletes; Tenant rows must always use deletedAt.
prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
  const startedAt = Date.now();
  assertTenantScopedRead(params);

  if (params.model === 'Tenant' && params.action === 'delete') {
    params.action = 'update';
    params.args['data'] = { deletedAt: new Date() };
  }
  if (params.model === 'Tenant' && params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data !== undefined) {
      params.args.data['deletedAt'] = new Date();
    } else {
      params.args['data'] = { deletedAt: new Date() };
    }
  }
  const result = await next(params);
  recordSlowQuery({
    model: params.model ?? null,
    action: params.action,
    durationMs: Date.now() - startedAt,
  });
  return result;
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

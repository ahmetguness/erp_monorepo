import type { PermissionAction } from '@prisma/client';
import type { Context, Next } from 'hono';
import { ForbiddenError, ValidationError } from '../errors/index.js';
import { hasAccessPermission } from '../modules/identity/application/index.js';
import { getAccessContext } from './access-context.js';

const MODULE_BY_ENTITY_TYPE: Readonly<Record<string, string>> = {
  INVOICE: 'invoicing',
  SALES_QUOTE: 'invoicing',
  SALES_ORDER: 'invoicing',
  DELIVERY_NOTE: 'invoicing',
  PRODUCT: 'inventory',
  CATEGORY: 'inventory',
  CONTACT: 'contacts',
  EMPLOYEE: 'hr',
  CUSTOMER_ASSET: 'service',
  SERVICE_REQUEST: 'service',
  PURCHASE_ORDER: 'purchasing',
  WORK_ORDER: 'production',
};

export function requireRecordContextPermission(action: PermissionAction, source: 'param' | 'query' = 'param') {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const entityType = source === 'param' ? c.req.param('entityType') : c.req.query('entityType');
    const module = entityType ? MODULE_BY_ENTITY_TYPE[entityType] : undefined;
    if (!module) return c.json(new ValidationError('Desteklenen bir entityType zorunludur.').toJSON(), 400);
    const accessContext = getAccessContext(c);
    if (!accessContext || !hasAccessPermission(accessContext, module, action)) {
      return c.json(new ForbiddenError(`Bu kayıt bağlamı için yetkiniz yok (${module}:${action}).`).toJSON(), 403);
    }
    await next();
  };
}

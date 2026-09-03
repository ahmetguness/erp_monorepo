import { ValidationError } from '../../../errors/index.js';
import type { RecoveryEntityType } from '../application/index.js';

const TYPES = new Set<string>(['INVOICE', 'PRODUCT', 'CATEGORY', 'CONTACT', 'EMPLOYEE', 'CUSTOMER_ASSET', 'SERVICE_REQUEST', 'PURCHASE_ORDER', 'SALES_QUOTE', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER']);
export function parseRecoveryEntityType(value: string | undefined): RecoveryEntityType {
  if (!value || !TYPES.has(value)) throw new ValidationError('Geçerli entityType zorunludur.');
  return value as RecoveryEntityType;
}

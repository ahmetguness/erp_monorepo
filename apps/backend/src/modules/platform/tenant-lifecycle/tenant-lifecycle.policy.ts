import { TENANT_TRANSITIONS, type TenantLifecycleStatus } from '@repo/types';
import { BaseError } from '../../../errors/index.js';

export class TenantLifecycleError extends BaseError {
  constructor(message: string, status: 400 | 403 | 404 | 409 = 409) { super(message, status, 'TENANT_LIFECYCLE_ERROR'); }
}
export function assertTenantTransition(from: TenantLifecycleStatus, to: TenantLifecycleStatus): void {
  const allowed: readonly TenantLifecycleStatus[] = TENANT_TRANSITIONS[from];
  if (!allowed.includes(to)) throw new TenantLifecycleError(`Geçersiz durum geçişi: ${from} → ${to}`);
}
export function assertLegacyTenantTransition(from: TenantLifecycleStatus, to: TenantLifecycleStatus): void {
  assertTenantTransition(from, to);
  if (['ARCHIVED', 'DELETION_SCHEDULED', 'DELETED'].includes(from) || ['ARCHIVED', 'DELETION_SCHEDULED', 'DELETED'].includes(to)) {
    throw new TenantLifecycleError('Bu işlem için yaşam döngüsü ve kapanış onay akışını kullanın.');
  }
}

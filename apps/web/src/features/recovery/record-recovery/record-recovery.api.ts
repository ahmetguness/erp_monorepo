import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import type { AuditEntityType } from '@/services/audit-log.service';
import { RecoveryItemsSchema } from './record-recovery.schemas';

export interface RecoveryRecordContext { entityType: AuditEntityType; entityId: string }
const path = ({ entityType, entityId }: RecoveryRecordContext) => `/api/operation-recovery/${entityType}/${encodeURIComponent(entityId)}`;
export async function getRecoveryItems(context: RecoveryRecordContext) { const response = await apiClient.get(path(context)); return safeParse(RecoveryItemsSchema, response.data.data, 'getRecoveryItems'); }
export async function undoOperation(context: RecoveryRecordContext, auditLogId: string) { const response = await apiClient.post(`${path(context)}/${encodeURIComponent(auditLogId)}/undo`); return safeParse(z.object({ restored: z.literal(true) }), response.data.data, 'undoOperation'); }

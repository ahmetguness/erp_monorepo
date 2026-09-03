import { ValidationError } from '../../../errors/index.js';
import type { CollaborationEntryType, RecordEntityType } from '../application/index.js';

const entityTypes = new Set<string>(['INVOICE', 'PRODUCT', 'CATEGORY', 'CONTACT', 'EMPLOYEE', 'CUSTOMER_ASSET', 'SERVICE_REQUEST', 'PURCHASE_ORDER', 'SALES_QUOTE', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER']);
const entryTypes = new Set<string>(['COMMENT', 'DECISION', 'EMAIL_LINK']);

export function parseEntityType(value: string | undefined): RecordEntityType {
  if (!value || !entityTypes.has(value)) throw new ValidationError('Geçerli entityType zorunludur.');
  return value as RecordEntityType;
}

export interface CreateEntryBody {
  type: CollaborationEntryType;
  content: string;
  mentionIds: string[];
  externalId?: string;
}

export function parseCreateEntryBody(value: unknown): CreateEntryBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError('Geçerli istek gövdesi zorunludur.');
  const body = value as Record<string, unknown>;
  if (typeof body.type !== 'string' || !entryTypes.has(body.type) || typeof body.content !== 'string') throw new ValidationError('Geçerli type ve content zorunludur.');
  const mentionIds = body.mentionIds === undefined ? [] : body.mentionIds;
  if (!Array.isArray(mentionIds) || !mentionIds.every((id): id is string => typeof id === 'string' && id.length > 0)) throw new ValidationError('mentionIds metin dizisi olmalıdır.');
  const externalId = typeof body.externalId === 'string' && body.externalId.trim() ? body.externalId.trim().slice(0, 200) : undefined;
  return { type: body.type as CollaborationEntryType, content: body.content, mentionIds, ...(externalId && { externalId }) };
}

export function parseFollowingBody(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || typeof (value as Record<string, unknown>).following !== 'boolean') throw new ValidationError('following alanı boolean olmalıdır.');
  return (value as { following: boolean }).following;
}

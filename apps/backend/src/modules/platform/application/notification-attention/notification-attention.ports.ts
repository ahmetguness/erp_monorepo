import type { AttentionEventType, AttentionMetrics, NotificationAttentionPreferences } from './notification-attention.types.js';

export interface NotificationAttentionRepository {
  isRoleInTenant(tenantId: string, roleId: string): Promise<boolean>;
  getPreferences(tenantId: string, userId: string): Promise<NotificationAttentionPreferences>;
  savePreferences(tenantId: string, userId: string, preferences: NotificationAttentionPreferences): Promise<void>;
  getMetrics(tenantId: string, userId: string): Promise<AttentionMetrics>;
  recordEvent(tenantId: string, userId: string, event: AttentionEventType): Promise<void>;
}

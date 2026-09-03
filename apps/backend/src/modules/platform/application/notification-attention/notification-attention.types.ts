export type DigestCadence = 'OFF' | 'DAILY' | 'WEEKLY';
export type AttentionEventType = 'IMPRESSION' | 'ACTION' | 'DISMISS' | 'DIGEST_OPENED';

export interface QuietHoursPreference {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export interface NotificationAttentionPreferences {
  quietHours: QuietHoursPreference;
  digest: { cadence: DigestCadence; hour: number; weekday: number };
  channels: { inApp: boolean; email: boolean };
  mutedModules: string[];
  escalation: { enabled: boolean; afterHours: number; targetRoleId: string | null };
}

export interface AttentionMetrics {
  impressions: number;
  actions: number;
  dismissals: number;
  digestOpens: number;
}

export interface AttentionSourceNotification {
  id: string;
  title: string;
  module: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
}

export interface AttentionGroup {
  eventKey: string;
  title: string;
  module: string | null;
  count: number;
  notificationIds: string[];
  latestAt: string;
}

export interface NotificationAttentionSummary {
  preferences: NotificationAttentionPreferences;
  quietHoursActive: boolean;
  focusSmartIds: string[];
  groupedSystemNotifications: AttentionGroup[];
  digestCount: number;
  suppressedCount: number;
  nextDigestAt: string | null;
  metrics: AttentionMetrics;
}

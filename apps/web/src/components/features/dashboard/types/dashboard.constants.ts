import type { SmartNotification } from '@/services/notification.service';
import type { RecommendationSeverity, TaskPriority } from './dashboard.types';

// ─────────────────────────────────────────────
// Invoice status display
// ─────────────────────────────────────────────

export const STATUS_DOT: Record<string, string> = {
  DRAFT: 'bg-slate-500',
  SENT: 'bg-blue-400',
  PAID: 'bg-emerald-400',
  PARTIALLY_PAID: 'bg-amber-400',
  OVERDUE: 'bg-red-400',
  CANCELLED: 'bg-slate-600',
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Taslak',
  SENT: 'Gönderildi',
  PAID: 'Ödendi',
  PARTIALLY_PAID: 'Kısmi',
  OVERDUE: 'Gecikmiş',
  CANCELLED: 'İptal',
};

// ─────────────────────────────────────────────
// Task / Recommendation tone maps
// ─────────────────────────────────────────────

export const TASK_TONE: Record<TaskPriority, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-sky-400',
  LOW: 'text-slate-500',
};

export const RECOMMENDATION_TONE: Record<RecommendationSeverity, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/5',
  HIGH: 'border-amber-500/30 bg-amber-500/5',
  MEDIUM: 'border-sky-500/25 bg-sky-500/5',
  LOW: 'border-slate-700 bg-slate-950/30',
};

export const SMART_NOTIFICATION_TONE: Record<SmartNotification['severity'], string> = {
  critical: 'border-red-500/25 bg-red-500/[0.04]',
  high: 'border-amber-500/25 bg-amber-500/[0.04]',
  medium: 'border-sky-500/25 bg-sky-500/[0.04]',
  low: 'border-slate-700 bg-slate-950/30',
};

export const SMART_NOTIFICATION_TEXT: Record<SmartNotification['severity'], string> = {
  critical: 'text-red-300',
  high: 'text-amber-300',
  medium: 'text-sky-300',
  low: 'text-slate-300',
};

// ─────────────────────────────────────────────
// Chart colours
// ─────────────────────────────────────────────

export const PIE_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
] as const;

export const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
} as const;

export type TodayWorkKind = 'TASK' | 'APPROVAL' | 'ANOMALY' | 'DATA_QUALITY' | 'AUTOMATION_EXCEPTION';
export type TodayWorkRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TodayWorkSlaState = 'ON_TRACK' | 'DUE_SOON' | 'BREACHED' | 'NO_DEADLINE';

export interface TodayWorkCandidate {
  id: string;
  sourceId: string;
  kind: TodayWorkKind;
  title: string;
  detail: string | null;
  risk: TodayWorkRisk;
  dueAt: Date | null;
  occurredAt: Date;
  monetaryImpact: number | null;
  assignee: { id: string; name: string } | null;
  reason: string;
  action: { kind: 'OPEN' | 'COMPLETE'; label: string; href: string };
}

export interface TodayWorkItem extends Omit<TodayWorkCandidate, 'dueAt' | 'occurredAt'> {
  dueAt: string | null;
  occurredAt: string;
  score: number;
  sla: { state: TodayWorkSlaState; remainingMinutes: number | null };
}

export interface TodayWorkQueue {
  generatedAt: string;
  items: readonly TodayWorkItem[];
  summary: { total: number; critical: number; breached: number; monetaryImpact: number };
}

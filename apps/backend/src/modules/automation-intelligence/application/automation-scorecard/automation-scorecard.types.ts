export type AutomationFeedbackOutcome = 'ACCEPTED' | 'REJECTED' | 'CORRECTED';
export interface AutomationFeedbackInput { outcome: AutomationFeedbackOutcome; reason: string | null; estimatedMinutesSaved: number | null; financialImpact: number | null }
export interface AutomationProcessMetric { process: string; executions: number; succeeded: number; failed: number; successRatePct: number; straightThroughRatePct: number; estimatedMinutesSaved: number }
export interface AutomationScorecard {
  periodDays: number; generatedAt: string;
  totals: { executions: number; automaticallyCompleted: number; failed: number; running: number; manualTouches: number; recoveries: number; accepted: number; rejected: number; corrected: number; straightThroughRatePct: number; successRatePct: number; estimatedHoursSaved: number; financialImpact: number };
  errorBudget: { targetSuccessRatePct: number; actualSuccessRatePct: number; remainingFailures: number; breached: boolean };
  processes: AutomationProcessMetric[]; feedbackReasons: Array<{ reason: string; count: number }>;
  backlog: Array<{ executionId: string; process: string; status: 'RUNNING' | 'FAILED'; startedAt: string; error: string | null }>;
  reviewQueue: Array<{ executionId: string; process: string; startedAt: string }>;
}

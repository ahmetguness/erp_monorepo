'use client';

import type { StockSummary } from '@/services/reporting.service';
import { StarterEDocumentControlCard } from '../StarterEDocumentControlCard';
import { PlanUsageLimitsCard } from '../PlanUsageLimitsCard';
import { StockAlertDashboardCard } from '@/components/features/stock/StockAlertDashboardCard';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export interface OperationsTabProps {
  stk: StockSummary | undefined;
  canReadInventory: boolean;
  canReadInvoicing: boolean;
  canReadSettings: boolean;
  isStarter: boolean;
  currentPlan: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function OperationsTab({
  canReadInventory,
  canReadInvoicing,
  canReadSettings,
  isStarter,
}: OperationsTabProps) {
  return (
    <div className="space-y-5">
      {/* ── Stock Alerts ── */}
      <StockAlertDashboardCard enabled={canReadInventory} />

      {/* ── Starter E-Document ── */}
      <StarterEDocumentControlCard enabled={isStarter && canReadInvoicing} />

      {/* ── Plan Usage Limits ── */}
      <PlanUsageLimitsCard enabled={canReadSettings} />
    </div>
  );
}

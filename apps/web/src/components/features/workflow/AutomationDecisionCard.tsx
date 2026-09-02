import { Badge } from '@/components/ui/Badge';
import type { AutomationDecisionExplanation } from '@/services/intelligence.service';

const RISK_VARIANT = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' } as const;

export function AutomationDecisionCard({ decision, compact = false }: { decision: AutomationDecisionExplanation; compact?: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-950/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RISK_VARIANT[decision.risk.level]}>Risk: {decision.risk.level}</Badge>
        <Badge variant={decision.confidence.band === 'HIGH' ? 'success' : 'warning'}>%{Math.round(decision.confidence.score * 100)} güven</Badge>
        <Badge variant={decision.control.requiresApproval ? 'warning' : 'info'}>{decision.control.mode}</Badge>
        {decision.control.dryRun && <Badge variant="neutral">Dry-run</Badge>}
      </div>
      <p className="text-slate-300">{decision.reason}</p>
      {!compact && (
        <div className="grid gap-2 text-slate-500 sm:grid-cols-2">
          <p><span className="text-slate-400">Etki:</span> {decision.impact.matchedRecords} kayıt{decision.impact.estimatedMonetaryAmount !== null ? ` / ${decision.impact.estimatedMonetaryAmount.toLocaleString('tr-TR')} TRY` : ''}</p>
          <p><span className="text-slate-400">Onay eşiği:</span> {decision.control.approvalThreshold.toLocaleString('tr-TR')} TRY</p>
          <p><span className="text-slate-400">Kaynak:</span> {decision.sources.join(', ')}</p>
          <p><span className="text-slate-400">Geri alma:</span> {decision.control.compensation}</p>
        </div>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

export interface CreditLimitBarProps {
  used: number;
  limit: number;
  className?: string;
}

export function CreditLimitBar({ used, limit, className }: CreditLimitBarProps) {
  if (limit <= 0) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const exceeded = used > limit;
  const barColor = exceeded ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = exceeded ? 'text-red-400' : pct > 80 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Kredi Limiti Kullanımı</span>
        <span className={textColor}>
          {formatCurrency(used)} / {formatCurrency(limit)}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {exceeded && (
        <p className="text-[11px] text-red-400">
          Limit {formatCurrency(used - limit)} aşıldı
        </p>
      )}
    </div>
  );
}

import { type LucideIcon, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'flex flex-col items-center justify-center px-4 py-12 text-center' : 'flex flex-col items-center justify-center px-4 py-14 text-center'}>
      <div className="mb-4 rounded-2xl border border-slate-800/80 bg-slate-900/65 p-4 shadow-inner shadow-black/10 ring-1 ring-white/[0.03]">
        <Icon className="w-7 h-7 text-slate-500" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-slate-300">{title}</h3>
      {description && <p className="max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

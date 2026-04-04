import { type LucideIcon, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800/60 mb-4">
        <Icon className="w-7 h-7 text-slate-600" />
      </div>
      <h3 className="text-sm font-medium text-slate-400 mb-0.5">{title}</h3>
      {description && <p className="text-xs text-slate-600 max-w-xs">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

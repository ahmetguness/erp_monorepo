'use client';

import type React from 'react';
import type { AuthUser } from '@repo/types';
import { X } from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ui/Button';

export type BulkPermissionAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT';
export type BulkExecutionMode = 'immediate' | 'job';

export interface BulkActionContext {
  selectedIds: readonly string[];
  clearSelection: () => void;
}

export interface BulkActionDefinition {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
  executionMode?: BulkExecutionMode;
  permission?: {
    module: string;
    action: BulkPermissionAction;
  };
  disabled?: boolean;
  onRun: (context: BulkActionContext) => void | Promise<void>;
}

export interface BulkActionBarProps {
  selectedIds: readonly string[];
  actions: readonly BulkActionDefinition[];
  user: AuthUser | null;
  onClear: () => void;
  className?: string;
}

function canRunAction(user: AuthUser | null, action: BulkActionDefinition): boolean {
  if (!action.permission) return true;
  const membership = user?.tenantMembership;
  if (user && !membership) return true;
  if (membership?.isOwner) return true;
  return Boolean(
    membership?.role?.permissions.some(
      (permission) =>
        permission.module === action.permission?.module &&
        permission.action === action.permission.action,
    ),
  );
}

export function BulkActionBar({ selectedIds, actions, user, onClear, className }: BulkActionBarProps) {
  const visibleActions = actions.filter((action) => canRunAction(user, action));
  if (selectedIds.length === 0) return null;

  const context: BulkActionContext = {
    selectedIds,
    clearSelection: onClear,
  };

  return (
    <div className={className ?? 'mb-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2.5'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-950/70 px-2.5 py-1 text-xs font-semibold text-sky-200">
            {selectedIds.length} secili
          </span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
            Temizle
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {visibleActions.length > 0 ? (
            visibleActions.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.variant ?? 'outline'}
                leftIcon={action.icon}
                disabled={action.disabled}
                onClick={() => {
                  void action.onRun(context);
                }}
              >
                {action.label}
                {action.executionMode === 'job' && (
                  <span className="ml-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-slate-400">
                    Job
                  </span>
                )}
              </Button>
            ))
          ) : (
            <span className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1 text-xs text-slate-500">
              Yetkili toplu aksiyon yok
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

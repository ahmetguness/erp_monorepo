import Link from 'next/link';
import {
  MessageSquare,
  ChevronRight,
  Wrench,
  CreditCard,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Clock,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { PlatformSupportTicketSummaryDto, PlatformTicketCategory } from '@repo/types';
import {
  CATEGORY_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  formatRelativeTime,
} from './ticket-ui';

interface TicketCardProps {
  ticket: PlatformSupportTicketSummaryDto;
}

const CATEGORY_ICON_MAP: Record<PlatformTicketCategory, React.ComponentType<{ className?: string }>> = {
  TECHNICAL: Wrench,
  BILLING: CreditCard,
  ACCOUNT: ShieldCheck,
  FEATURE_REQUEST: Sparkles,
  OTHER: HelpCircle,
};

export function TicketCard({ ticket }: TicketCardProps) {
  const statusConfig = STATUS_CONFIG[ticket.status] || {
    label: ticket.status,
    variant: 'neutral',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
    description: '',
  };

  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || {
    label: ticket.priority,
    variant: 'neutral',
    borderColor: 'border-slate-700',
    textColor: 'text-slate-400',
    dotColor: 'bg-slate-400',
    bgSoft: 'bg-slate-800/40',
  };

  const CategoryIcon = CATEGORY_ICON_MAP[ticket.category] || HelpCircle;
  const isActionNeeded = ticket.status === 'WAITING_TENANT';

  return (
    <Link
      href={`/dashboard/tickets/${ticket.id}`}
      className={`group relative block rounded-xl border bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${
        isActionNeeded
          ? 'border-rose-900/50 hover:border-rose-700 shadow-rose-950/10'
          : 'border-slate-800 hover:border-sky-500/40 hover:shadow-sky-950/10'
      }`}
    >
      {/* Left priority accent indicator */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${
          ticket.priority === 'URGENT'
            ? 'bg-rose-500'
            : ticket.priority === 'HIGH'
            ? 'bg-amber-500'
            : ticket.priority === 'MEDIUM'
            ? 'bg-sky-500'
            : 'bg-slate-700'
        }`}
      />

      <div className="pl-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side details */}
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/50">
              {ticket.ticketNumber}
            </span>

            {/* Status with animated dot */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
              {statusConfig.label}
            </span>

            {/* Priority Badge */}
            <Badge variant={priorityConfig.variant}>{priorityConfig.label}</Badge>

            {/* Category */}
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">
              <CategoryIcon className="h-3 w-3 text-slate-400" />
              {CATEGORY_LABELS[ticket.category] || ticket.category}
            </span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors truncate">
              {ticket.title}
            </h3>
            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 leading-relaxed">
              {ticket.description}
            </p>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            {ticket.createdByUser && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {ticket.createdByUser.name}
              </span>
            )}
            {ticket.assignedAdmin && (
              <span className="flex items-center gap-1 text-sky-400/90">
                <ShieldCheck className="h-3 w-3" />
                Temsilci: {ticket.assignedAdmin.name}
              </span>
            )}
          </div>
        </div>

        {/* Right side stats */}
        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 text-xs text-slate-400 border-t border-slate-800/60 pt-2 sm:pt-0 sm:border-none">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/40 px-2.5 py-1 text-slate-300 border border-slate-800">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold">{ticket.messageCount}</span>
            <span className="text-slate-500 text-[11px]">mesaj</span>
          </div>

          <div className="flex items-center gap-1 text-slate-400 text-xs" title={ticket.updatedAt}>
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span>{formatRelativeTime(ticket.updatedAt)}</span>
          </div>

          <div className="h-8 w-8 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-500 group-hover:bg-sky-500/20 group-hover:text-sky-400 transition-colors">
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

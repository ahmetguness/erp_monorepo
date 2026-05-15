import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from './EmptyState';
import { Pagination, type PaginationProps } from '@/components/ui/Pagination';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  pagination?: PaginationProps;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

// ─────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-slate-800/35">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="h-4 rounded-md bg-slate-800/80 animate-pulse shadow-sm"
            style={{ width: `${50 + (i % 3) * 20}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────
// DataTable
// ─────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  pagination,
  onRowClick,
  emptyTitle = 'Kayıt bulunamadı',
  emptyDescription,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/45 shadow-xl shadow-black/10',
      'ring-1 ring-white/[0.03] backdrop-blur-sm',
      className,
    )}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-800/80 bg-slate-900/95">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-5 py-3.5 text-[11px] font-semibold uppercase text-slate-400 whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} compact />
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'group border-b border-slate-800/35 transition-colors duration-150 last:border-b-0',
                    onRowClick && 'cursor-pointer',
                    idx % 2 === 1 ? 'bg-slate-900/18' : 'bg-slate-950/10',
                    'hover:bg-sky-500/[0.045]',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-4 text-slate-300 align-middle',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !isLoading && data.length > 0 && (
        <div className="border-t border-slate-800/70 bg-slate-900/45 px-5 py-3.5">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}

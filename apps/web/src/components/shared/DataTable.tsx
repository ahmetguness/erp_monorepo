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
    <tr className="border-b border-slate-800/30">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-4 bg-slate-800/80 rounded-md animate-pulse" style={{ width: `${50 + (i % 3) * 20}%` }} />
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
    <div className={cn('bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg shadow-black/5', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap first:rounded-tl-none last:rounded-tr-none',
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
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'border-b border-slate-800/30 transition-all duration-150',
                    onRowClick && 'cursor-pointer hover:bg-sky-500/[0.03]',
                    idx % 2 === 1 && 'bg-slate-800/[0.08]',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-3.5 text-slate-300',
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
        <div className="px-5 py-3.5 border-t border-slate-800/50 bg-slate-800/10">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}

import type { MailDeliveryStatus, MailDirection } from '@/services/mail.service';

interface MailCenterFiltersProps {
  search: string;
  direction: MailDirection | '';
  status: MailDeliveryStatus | '';
  onSearchChange: (value: string) => void;
  onDirectionChange: (value: MailDirection | '') => void;
  onStatusChange: (value: MailDeliveryStatus | '') => void;
}

const MAIL_DIRECTIONS: readonly MailDirection[] = ['INBOUND', 'OUTBOUND'];
const MAIL_DELIVERY_STATUSES: readonly MailDeliveryStatus[] = ['PENDING', 'SENT', 'FAILED'];

function parseDirection(value: string): MailDirection | '' {
  return MAIL_DIRECTIONS.find((item) => item === value) ?? '';
}

function parseStatus(value: string): MailDeliveryStatus | '' {
  return MAIL_DELIVERY_STATUSES.find((item) => item === value) ?? '';
}

export function MailCenterFilters({
  search,
  direction,
  status,
  onSearchChange,
  onDirectionChange,
  onStatusChange,
}: MailCenterFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Konu, alici veya gonderen ara"
        className="h-9 min-w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
      />
      <select
        value={direction}
        onChange={(event) => onDirectionChange(parseDirection(event.target.value))}
        className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500/60"
      >
        <option value="">Tum yonler</option>
        <option value="OUTBOUND">Giden</option>
        <option value="INBOUND">Gelen</option>
      </select>
      <select
        value={status}
        onChange={(event) => onStatusChange(parseStatus(event.target.value))}
        className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500/60"
      >
        <option value="">Tum durumlar</option>
        <option value="SENT">Gonderildi</option>
        <option value="FAILED">Hatali</option>
        <option value="PENDING">Bekliyor</option>
      </select>
    </div>
  );
}


'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { BellRing, Clock3, Layers3, Moon, Settings2 } from 'lucide-react';
import { useNotificationAttention, useRecordNotificationAttentionEvent, useUpdateNotificationAttentionPreferences } from '@/hooks/useNotifications';
import type { NotificationAttentionPreferences } from '@/services/notification.service';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Kapalı';
}

export function NotificationAttentionPanel() {
  const { data } = useNotificationAttention();
  const update = useUpdateNotificationAttentionPreferences();
  const record = useRecordNotificationAttentionEvent();
  const impressionRecorded = useRef(false);

  useEffect(() => {
    if (!data || impressionRecorded.current) return;
    impressionRecorded.current = true;
    record.mutate('IMPRESSION');
  }, [data, record]);

  if (!data) return null;
  const save = (preferences: NotificationAttentionPreferences) => update.mutate(preferences);
  const duplicateCount = data.groupedSystemNotifications.reduce((total, group) => total + Math.max(0, group.count - 1), 0);

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-slate-900/70 p-5 shadow-xl" aria-labelledby="attention-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-sky-400" />
            <h2 id="attention-title" className="font-bold text-white">Dikkat merkezi</h2>
            {data.quietHoursActive && <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-300">Sessiz saatler</span>}
          </div>
          <p className="mt-1 text-xs text-slate-400">Tekrarlanan olaylar gruplanır; kritik olmayan işler seçtiğiniz özete bırakılır.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric icon={<BellRing className="h-3.5 w-3.5" />} label="Şimdi odaklan" value={data.focusSmartIds.length} />
          <Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="Özete ayrıldı" value={data.digestCount} />
          <Metric icon={<Layers3 className="h-3.5 w-3.5" />} label="Birleştirildi" value={duplicateCount} />
          <Metric icon={<Moon className="h-3.5 w-3.5" />} label="Sessize alındı" value={data.suppressedCount} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
        <span>Sonraki özet: <strong className="text-slate-200">{formatDate(data.nextDigestAt)}</strong></span>
        <span>Aksiyon oranı: <strong className="text-slate-200">{data.metrics.impressions > 0 ? Math.round((data.metrics.actions / data.metrics.impressions) * 100) : 0}%</strong></span>
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-800"><Settings2 className="h-3.5 w-3.5" /> Dikkat tercihleri</summary>
          <div className="mt-2 grid min-w-72 gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl sm:grid-cols-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={data.preferences.quietHours.enabled} onChange={(event) => save({ ...data.preferences, quietHours: { ...data.preferences.quietHours, enabled: event.target.checked } })} /> Sessiz saatleri kullan</label>
            <label>Özet sıklığı<select className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 p-1.5" value={data.preferences.digest.cadence} onChange={(event) => save({ ...data.preferences, digest: { ...data.preferences.digest, cadence: event.target.value as NotificationAttentionPreferences['digest']['cadence'] } })}><option value="OFF">Kapalı</option><option value="DAILY">Günlük</option><option value="WEEKLY">Haftalık</option></select></label>
            <label>Başlangıç<input className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 p-1.5" type="time" value={data.preferences.quietHours.start} onChange={(event) => save({ ...data.preferences, quietHours: { ...data.preferences.quietHours, start: event.target.value } })} /></label>
            <label>Bitiş<input className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 p-1.5" type="time" value={data.preferences.quietHours.end} onChange={(event) => save({ ...data.preferences, quietHours: { ...data.preferences.quietHours, end: event.target.value } })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={data.preferences.channels.email} onChange={(event) => save({ ...data.preferences, channels: { ...data.preferences.channels, email: event.target.checked } })} /> E-posta özeti</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={data.preferences.escalation.enabled} onChange={(event) => save({ ...data.preferences, escalation: { ...data.preferences.escalation, enabled: event.target.checked } })} /> Gecikenleri eskale et</label>
          </div>
        </details>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2"><div className="flex items-center gap-1 text-[10px] text-slate-500">{icon}{label}</div><div className="mt-0.5 text-lg font-black text-white">{value}</div></div>;
}

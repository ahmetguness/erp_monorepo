import type { ReactNode } from 'react';
import type { Tenant360Snapshot } from '@repo/types';

export const TENANT_360_TABS = ['Genel Bakış', 'Kullanım', 'Abonelik', 'Entegrasyonlar', 'Operasyon', 'Güvenlik', 'Değişiklik Geçmişi', 'Destek'] as const;
export type Tenant360Tab = typeof TENANT_360_TABS[number];
const date = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : '—';
const denied = <p>Bu bölüm için görüntüleme yetkiniz yok.</p>;

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{headers.map(header => <th className="border-b p-3" key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td className="border-b p-3 align-top" key={column}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="py-4 text-slate-500">Kayıt bulunamadı.</p>;
}

export function Tenant360Panels({ tab, data }: { tab: Tenant360Tab; data: Tenant360Snapshot }) {
  switch (tab) {
    case 'Kullanım': return <div className="space-y-5">
      <DataTable headers={['Kaynak', 'Kullanılan', 'Limit', 'Doluluk']} rows={data.usage.metrics.map(metric => [metric.label, `${metric.used.toLocaleString('tr-TR')}${metric.unit === 'bytes' ? ' bayt' : ''}`, metric.limit?.toLocaleString('tr-TR') ?? 'Sınırsız', metric.percent === null ? '—' : `${Math.round(metric.percent)}%`])} />
      <p>{data.usage.activitySource}</p>
      <DataTable headers={['Gün (UTC)', 'İşlem', 'Aktif kullanıcı']} rows={data.usage.dailyActivity.map(day => [day.date, day.actions, day.users])} />
    </div>;
    case 'Abonelik': return <div className="space-y-4"><DataTable headers={['Alan', 'Değer']} rows={[
      ['Plan', data.subscription.plan], ['Durum', data.subscription.status], ['Deneme sonu', date(data.subscription.trialEndsAt)], ['Abonelik başlangıcı', date(data.subscription.start)], ['Abonelik sonu', date(data.subscription.end)], ['Kullanıcı fiyatı (yapılandırılmış)', data.subscription.userPrice ?? 'Tanımlı değil'], ['Özel fiyatlandırma', data.subscription.customPricing ? 'Evet' : 'Hayır'],
    ]} /><p>{data.subscription.billingNote}</p></div>;
    case 'Entegrasyonlar': return data.integrations === null ? denied : <DataTable headers={['Entegrasyon', 'Kanal', 'Durum', 'Son senkronizasyon', 'Hata sayısı']} rows={data.integrations.map(row => [row.name, row.channel, row.isActive ? 'Aktif' : 'Pasif', date(row.lastSyncAt), row.syncErrors])} />;
    case 'Operasyon': return data.operations === null ? denied : <div className="space-y-5"><h3>Kuyruk kayıtları (tüm saklanan kayıtlar)</h3><DataTable headers={['Kaynak', 'Durum', 'Adet']} rows={data.operations.queue.map(row => [row.source, row.status, row.count])} /><h3>Son 20 başarısız iş / olay</h3><p className="text-sm text-slate-500">Hassas veri içerebilen ham hata mesajları ve iş yükleri gösterilmez.</p><DataTable headers={['Kaynak', 'İş / olay', 'Durum', 'Deneme', 'Güncelleme']} rows={data.operations.recentFailures.map(row => [row.source, <span key={row.id} title={row.id}>{row.name}</span>, row.status, row.attempts, date(row.updatedAt)])} /></div>;
    case 'Güvenlik': return data.security === null ? denied : <div><p>İlk 200 üyelik; son aktivite yalnızca bu tenant’ın denetim kayıtlarına dayanır.</p><DataTable headers={['Kullanıcı', 'E-posta', 'Rol', 'Durum', 'Son tenant işlemi']} rows={data.security.members.map(row => [row.name, row.email, row.isOwner ? 'Sahip' : row.role ?? '—', row.isActive ? 'Aktif' : 'Pasif', date(row.lastTenantActivityAt)])} /></div>;
    case 'Değişiklik Geçmişi': return data.changes === null ? denied : <div><p>Son 50 admin değişikliği</p><DataTable headers={['Tarih', 'Admin', 'Modül / işlem', 'Gerekçe', 'Talep']} rows={data.changes.map(row => [date(row.createdAt), row.admin?.name ?? '—', `${row.module} / ${row.action}`, row.reason ?? '—', row.ticketId ?? '—'])} /></div>;
    default: return null;
  }
}

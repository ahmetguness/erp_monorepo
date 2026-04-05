'use client';

import { useState } from 'react';
import { Plus, Link2, Trash2, ToggleLeft, ToggleRight, Eye, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useIntegrations, useCreateIntegration, useUpdateIntegration, useDeleteIntegration } from '@/hooks/useMarketplace';
import { formatDate } from '@/lib/utils';
import type { MarketplaceIntegration } from '@/services/marketplace.service';

const CHANNELS = [
  { value: 'TRENDYOL', label: 'Trendyol', color: 'text-orange-400 bg-orange-500/10' },
  { value: 'HEPSIBURADA', label: 'Hepsiburada', color: 'text-amber-400 bg-amber-500/10' },
  { value: 'N11', label: 'N11', color: 'text-purple-400 bg-purple-500/10' },
  { value: 'AMAZON', label: 'Amazon', color: 'text-yellow-400 bg-yellow-500/10' },
  { value: 'CICEKSEPETI', label: 'Çiçeksepeti', color: 'text-pink-400 bg-pink-500/10' },
  { value: 'OTHER', label: 'Diğer', color: 'text-slate-400 bg-slate-500/10' },
];

const getChannelInfo = (ch: string) => CHANNELS.find((c) => c.value === ch) ?? CHANNELS[5];

export function IntegrationsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ channel: 'TRENDYOL', name: '', apiKey: '', apiSecret: '', storeId: '' });

  const { data: integrations = [], isLoading } = useIntegrations();
  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();

  return (
    <div>
      <PageHeader title="Pazaryeri Entegrasyonları" subtitle="E-ticaret kanallarını bağlayın ve yönetin."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" />Yeni Entegrasyon</Button>} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="text-center py-20">
          <Link2 className="w-10 h-10 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Henüz entegrasyon yok.</p>
          <p className="text-slate-600 text-xs mt-1">Bir pazaryeri kanalı bağlayarak başlayın.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((intg) => {
            const ch = getChannelInfo(intg.channel);
            return (
              <div key={intg.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ch.color}`}>
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium text-sm">{intg.name}</h3>
                      <span className="text-xs text-slate-500">{ch.label}</span>
                    </div>
                  </div>
                  {intg.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Ürün</div>
                    <div className="text-sm text-white font-medium">{intg._count?.listings ?? 0}</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Sipariş</div>
                    <div className="text-sm text-white font-medium">{intg._count?.orders ?? 0}</div>
                  </div>
                </div>

                {intg.syncErrors > 0 && (
                  <div className="flex items-center gap-2 text-xs text-red-400 mb-3">
                    <AlertCircle className="w-3 h-3" />{intg.syncErrors} senkronizasyon hatası
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-600">
                    {intg.lastSyncAt ? `Son sync: ${formatDate(intg.lastSyncAt)}` : 'Henüz senkronize edilmedi'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => update.mutate({ id: intg.id, data: { isActive: !intg.isActive } })}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
                      {intg.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => remove.mutate(intg.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Pazaryeri Entegrasyonu" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.name.trim()}
            onClick={() => create.mutate({ channel: form.channel, name: form.name, apiKey: form.apiKey || undefined, apiSecret: form.apiSecret || undefined, storeId: form.storeId || undefined },
              { onSuccess: () => { setCreateOpen(false); setForm({ channel: 'TRENDYOL', name: '', apiKey: '', apiSecret: '', storeId: '' }); } })}>Bağla</Button></>}>
        <div className="space-y-4">
          <Select label="Kanal" required options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))} value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))} />
          <Input label="Entegrasyon Adı" required placeholder="ör. Trendyol Mağazam" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="API Key" placeholder="Opsiyonel" value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} />
          <Input label="API Secret" placeholder="Opsiyonel" type="password" value={form.apiSecret} onChange={(e) => setForm((p) => ({ ...p, apiSecret: e.target.value }))} />
          <Input label="Mağaza ID" placeholder="Opsiyonel" value={form.storeId} onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

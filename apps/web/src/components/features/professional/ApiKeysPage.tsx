'use client';

import { useState } from 'react';
import { Plus, Key, Copy, Shield, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey } from '@/hooks/useApiKeys';
import { formatDate } from '@/lib/utils';
import type { ApiKey } from '@/services/api-key.service';

export function ApiKeysPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [rawKey, setRawKey] = useState('');
  const [form, setForm] = useState({ name: '', expiresAt: '' });

  const { data, isLoading } = useApiKeys({ page, limit: 20 });
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  const columns: ColumnDef<ApiKey>[] = [
    { key: 'name', header: 'Ad', render: (r) => (
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-amber-400" />
        <span className="text-white font-medium">{r.name}</span>
      </div>
    )},
    { key: 'keyPrefix', header: 'Anahtar', width: '120px', render: (r) => <span className="font-mono text-slate-400 text-xs">{r.keyPrefix}••••••••</span> },
    { key: 'scopes', header: 'Kapsamlar', width: '150px', render: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.scopes.length > 0 ? r.scopes.slice(0, 2).map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{s}</span>) : <span className="text-slate-600 text-xs">Tümü</span>}
        {r.scopes.length > 2 && <span className="text-[10px] text-slate-500">+{r.scopes.length - 2}</span>}
      </div>
    )},
    { key: 'lastUsedAt', header: 'Son Kullanım', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.lastUsedAt ? formatDate(r.lastUsedAt) : 'Hiç'}</span> },
    { key: 'expiresAt', header: 'Bitiş', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{r.expiresAt ? formatDate(r.expiresAt) : 'Süresiz'}</span> },
    { key: 'isActive', header: 'Durum', width: '100px', render: (r) => r.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="danger">İptal</Badge> },
    { key: 'actions', header: '', width: '140px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.isActive && (
            <button type="button" onClick={(e) => { e.stopPropagation(); revokeKey.mutate(r.id); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
              <Shield className="w-3 h-3" />İptal Et
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); deleteKey.mutate(r.id); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="API Anahtarları" subtitle="API erişim anahtarlarını oluşturun ve yönetin."
        action={
          <button onClick={() => { setCreateOpen(true); setRawKey(''); }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Anahtar
          </button>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="API anahtarı bulunamadı" emptyDescription="Yeni bir API anahtarı oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={rawKey ? 'API Anahtarı Oluşturuldu' : 'Yeni API Anahtarı'} size="sm"
        footer={rawKey ? (
          <Button size="sm" onClick={() => setCreateOpen(false)}>Tamam</Button>
        ) : (<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createKey.isPending} onClick={() => {
            createKey.mutate({ name: form.name, expiresAt: form.expiresAt || undefined }, {
              onSuccess: (data) => { if (data.rawKey) setRawKey(data.rawKey); },
            });
          }}>Oluştur</Button>
        </>)}>
        {rawKey ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400 mb-2">Bu anahtar sadece bir kez gösterilir. Lütfen güvenli bir yere kaydedin.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-white bg-slate-800 p-2 rounded break-all">{rawKey}</code>
                <button onClick={() => navigator.clipboard.writeText(rawKey)} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
                  <Copy className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input label="Anahtar Adı" required placeholder="Örn: Production API" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label="Bitiş Tarihi" type="date" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          </div>
        )}
      </Modal>
    </div>
  );
}

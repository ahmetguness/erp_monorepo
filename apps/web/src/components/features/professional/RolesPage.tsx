'use client';

import { useState } from 'react';
import { Plus, Shield, Trash2, Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useRoles, useCreateRole, useDeleteRole } from '@/hooks/useRoles';
import { formatDate } from '@/lib/utils';
import type { Role } from '@/services/role.service';

export function RolesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data, isLoading } = useRoles({ page, limit: 20 });
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();

  const columns: ColumnDef<Role>[] = [
    { key: 'name', header: 'Rol Adı', render: (r) => (
      <div className="flex items-center gap-2">
        <Shield className={`w-4 h-4 ${r.isSystem ? 'text-amber-400' : 'text-sky-400'}`} />
        <span className="text-white font-medium">{r.name}</span>
        {r.isSystem && <Badge variant="warning"><Lock className="w-2.5 h-2.5 mr-0.5" />Sistem</Badge>}
      </div>
    )},
    { key: 'description', header: 'Açıklama', render: (r) => <span className="text-slate-400 text-xs">{r.description ?? '—'}</span> },
    { key: 'permissions', header: 'İzin', width: '80px', align: 'center', render: (r) => <span className="text-slate-300">{r.permissions?.length ?? 0}</span> },
    { key: 'users', header: 'Kullanıcı', width: '90px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.users ?? 0}</span> },
    { key: 'createdAt', header: 'Oluşturma', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
    { key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => !r.isSystem ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); deleteRole.mutate(r.id); }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Rol Yönetimi" subtitle="Kullanıcı rollerini ve izinlerini yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Rol
          </button>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Rol bulunamadı" emptyDescription="Yeni bir rol oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Rol" size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createRole.isPending} onClick={() => {
            createRole.mutate({ name: form.name, description: form.description || undefined },
              { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Rol Adı" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Açıklama" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

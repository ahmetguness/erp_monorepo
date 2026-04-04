'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useUnits, useCreateUnit, useDeleteUnit } from '@/hooks/useMasterData';
import type { Unit } from '@/services/master-data.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const createUnitSchema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  code: z.string().min(1, 'Kod zorunludur').max(10, 'Kod en fazla 10 karakter'),
});

type CreateUnitForm = z.infer<typeof createUnitSchema>;

// ─────────────────────────────────────────────
// Columns
// ─────────────────────────────────────────────

function useColumns(onDelete: (unit: Unit) => void): ColumnDef<Unit>[] {
  return [
    { key: 'code', header: 'Kod', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.code}</span> },
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: 'actions', header: '', width: '60px', align: 'right',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(r); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Sil"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function UnitsManager() {
  const { data: units = [], isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const deleteUnit = useDeleteUnit();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateUnitForm>({
    resolver: zodResolver(createUnitSchema),
  });

  const onSubmit = (data: CreateUnitForm) => {
    createUnit.mutate(data, {
      onSuccess: () => { setCreateOpen(false); reset(); },
    });
  };

  const columns = useColumns((unit) => setDeleteTarget(unit));

  return (
    <div>
      <PageHeader
        title="Birimler"
        subtitle="Ürünlerde kullanılan ölçü birimlerini yönetin."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            Yeni Birim
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={units}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Henüz birim eklenmemiş"
        emptyDescription="Ürünlerinizde kullanmak için birim ekleyin."
      />

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); reset(); }}
        title="Yeni Birim"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={createUnit.isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormRow cols={2}>
            <Input label="Ad" required placeholder="Kilogram" error={errors.name?.message} {...register('name')} />
            <Input label="Kod" required placeholder="KG" error={errors.code?.message} {...register('code')} />
          </FormRow>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteUnit.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
          }
        }}
        message={`"${deleteTarget?.name}" birimini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        isLoading={deleteUnit.isPending}
      />
    </div>
  );
}

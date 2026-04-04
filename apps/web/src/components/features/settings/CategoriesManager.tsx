'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useMasterData';
import type { CategoryItem } from '@/services/master-data.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  parentId: z.string().optional(),
});

type CategoryForm = z.infer<typeof categorySchema>;

// ─────────────────────────────────────────────
// Category row (recursive)
// ─────────────────────────────────────────────

interface CategoryRowProps {
  category: CategoryItem;
  depth: number;
  onEdit: (c: CategoryItem) => void;
  onDelete: (c: CategoryItem) => void;
}

function CategoryRow({ category, depth, onEdit, onDelete }: CategoryRowProps) {
  return (
    <>
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors group"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        {depth > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
        <span className="flex-1 text-sm text-slate-300">{category.name}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(category)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
            aria-label="Düzenle"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(category)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {category.children?.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function CategoriesManager() {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [modalState, setModalState] = useState<{ open: boolean; editing: CategoryItem | null }>({
    open: false, editing: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
  });

  const openCreate = () => { reset({ name: '', parentId: '' }); setModalState({ open: true, editing: null }); };
  const openEdit = (c: CategoryItem) => {
    reset({ name: c.name, parentId: c.parentId ?? '' });
    setModalState({ open: true, editing: c });
  };
  const closeModal = () => { setModalState({ open: false, editing: null }); reset(); };

  const onSubmit = (data: CategoryForm) => {
    const payload = { name: data.name, parentId: data.parentId || undefined };
    if (modalState.editing) {
      updateCategory.mutate({ id: modalState.editing.id, data: payload }, { onSuccess: closeModal });
    } else {
      createCategory.mutate(payload, { onSuccess: closeModal });
    }
  };

  // Flat list for parent select (exclude editing item and its children)
  const flatCategories = (cats: CategoryItem[], depth = 0): { id: string; name: string; depth: number }[] =>
    cats.flatMap((c) => [{ id: c.id, name: c.name, depth }, ...flatCategories(c.children ?? [], depth + 1)]);

  const parentOptions = flatCategories(categories)
    .filter((c) => c.id !== modalState.editing?.id)
    .map((c) => ({ value: c.id, label: `${'— '.repeat(c.depth)}${c.name}` }));

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <div>
      <PageHeader
        title="Kategoriler"
        subtitle="Ürün kategorilerini hiyerarşik olarak yönetin."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Yeni Kategori
          </Button>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <FullPageSpinner />
        ) : categories.length === 0 ? (
          <EmptyState title="Henüz kategori eklenmemiş" description="Ürünlerinizi organize etmek için kategori ekleyin." />
        ) : (
          categories.map((cat) => (
            <CategoryRow key={cat.id} category={cat} depth={0} onEdit={openEdit} onDelete={setDeleteTarget} />
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalState.open}
        onClose={closeModal}
        title={modalState.editing ? 'Kategori Düzenle' : 'Yeni Kategori'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Ad" required placeholder="Elektronik" error={errors.name?.message} {...register('name')} />
          <Select
            label="Üst Kategori"
            placeholder="— Üst kategori yok —"
            options={parentOptions}
            {...register('parentId')}
          />
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteCategory.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
        message={`"${deleteTarget?.name}" kategorisini silmek istediğinize emin misiniz?`}
        isLoading={deleteCategory.isPending}
      />
    </div>
  );
}

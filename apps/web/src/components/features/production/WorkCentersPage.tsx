"use client";

import { useState } from "react";
import {
  Plus,
  Factory,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  useWorkCenters,
  useCreateWorkCenter,
  useUpdateWorkCenter,
  useDeleteWorkCenter,
} from "@/hooks/useProduction";
import type { WorkCenter } from "@/services/production.service";

export function WorkCentersPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkCenter | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    capacity: "",
  });

  const { data, isLoading } = useWorkCenters({ page, limit: 50 });
  const create = useCreateWorkCenter();
  const update = useUpdateWorkCenter();
  const remove = useDeleteWorkCenter();

  const columns: ColumnDef<WorkCenter>[] = [
    {
      key: "code",
      header: "Kod",
      width: "100px",
      render: (r) => <span className="font-mono text-sky-400">{r.code}</span>,
    },
    {
      key: "name",
      header: "İş Merkezi",
      render: (r) => (
        <div>
          <span className="text-white font-medium text-sm">{r.name}</span>
          {r.description && (
            <span className="block text-xs text-slate-500 mt-0.5">
              {r.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "capacity",
      header: "Kapasite",
      width: "100px",
      align: "center",
      render: (r) => (
        <span className="text-slate-300">{r.capacity ?? "—"}</span>
      ),
    },
    {
      key: "operations",
      header: "Operasyon",
      width: "90px",
      align: "center",
      render: (r) => (
        <span className="text-slate-400">{r._count?.operations ?? 0}</span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "90px",
      render: (r) =>
        r.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="neutral">Pasif</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditTarget(r);
              setForm({
                code: r.code,
                name: r.name,
                description: r.description ?? "",
                capacity: r.capacity?.toString() ?? "",
              });
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            aria-label="Düzenle"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              update.mutate({ id: r.id, data: { isActive: !r.isActive } });
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
            aria-label="Durum değiştir"
          >
            {r.isActive ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate(r.id);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const resetForm = () =>
    setForm({ code: "", name: "", description: "", capacity: "" });

  return (
    <div>
      <PageHeader
        title="İş Merkezleri"
        subtitle="Üretim iş merkezlerini yönetin."
        action={
          <Button
            size="sm"
            onClick={() => {
              setCreateOpen(true);
              resetForm();
            }}
          >
            <Plus className="w-4 h-4" />
            Yeni İş Merkezi
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="İş merkezi bulunamadı"
        emptyDescription="Yeni bir iş merkezi oluşturarak başlayın."
        pagination={
          data
            ? {
                page,
                pageSize: 50,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni İş Merkezi"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.code.trim() || !form.name.trim()}
              onClick={() =>
                create.mutate(
                  {
                    code: form.code,
                    name: form.name,
                    description: form.description || undefined,
                    capacity: form.capacity ? Number(form.capacity) : undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      resetForm();
                    },
                  },
                )
              }
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Kod"
            required
            placeholder="ör. WC01"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          />
          <Input
            label="Ad"
            required
            placeholder="ör. Montaj Hattı 1"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Açıklama"
            placeholder="Opsiyonel"
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
          <Input
            label="Kapasite"
            type="number"
            placeholder="ör. 100"
            value={form.capacity}
            onChange={(e) =>
              setForm((p) => ({ ...p, capacity: e.target.value }))
            }
          />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="İş Merkezi Düzenle"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditTarget(null)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={update.isPending}
              disabled={!form.name.trim()}
              onClick={() => {
                if (!editTarget) return;
                update.mutate(
                  {
                    id: editTarget.id,
                    data: {
                      name: form.name,
                      description: form.description || undefined,
                      capacity: form.capacity
                        ? Number(form.capacity)
                        : undefined,
                    },
                  },
                  { onSuccess: () => setEditTarget(null) },
                );
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Ad"
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Açıklama"
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
          <Input
            label="Kapasite"
            type="number"
            value={form.capacity}
            onChange={(e) =>
              setForm((p) => ({ ...p, capacity: e.target.value }))
            }
          />
        </div>
      </Modal>
    </div>
  );
}

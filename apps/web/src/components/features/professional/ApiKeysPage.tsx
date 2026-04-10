"use client";

import { useState } from "react";
import {
  Plus,
  Key,
  Copy,
  Shield,
  Trash2,
  Eye,
  Check,
  X,
  Clock,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
} from "@/hooks/useApiKeys";
import { formatDate } from "@/lib/utils";
import type { ApiKey } from "@/services/api-key.service";

const AVAILABLE_SCOPES = [
  {
    key: "products:read",
    label: "Ürünler — Okuma",
    desc: "Ürün listesi, detay ve stok seviyeleri görüntüleme",
  },
  {
    key: "products:write",
    label: "Ürünler — Yazma",
    desc: "Ürün oluşturma, güncelleme ve stok hareketi kaydetme",
  },
  {
    key: "products:delete",
    label: "Ürünler — Silme",
    desc: "Ürün silme (soft delete)",
  },
  {
    key: "contacts:read",
    label: "Cari Hesaplar — Okuma",
    desc: "Müşteri ve tedarikçi bilgilerini görüntüleme",
  },
  {
    key: "contacts:write",
    label: "Cari Hesaplar — Yazma",
    desc: "Cari hesap oluşturma ve güncelleme",
  },
  {
    key: "contacts:delete",
    label: "Cari Hesaplar — Silme",
    desc: "Cari hesap silme (soft delete)",
  },
  {
    key: "invoices:read",
    label: "Faturalar — Okuma",
    desc: "Fatura listesi, detay ve satırları görüntüleme",
  },
  {
    key: "invoices:write",
    label: "Faturalar — Yazma",
    desc: "Fatura oluşturma",
  },
  {
    key: "invoices:delete",
    label: "Faturalar — İptal",
    desc: "Fatura iptal etme",
  },
  {
    key: "orders:read",
    label: "Siparişler — Okuma",
    desc: "Satış siparişi listesi görüntüleme",
  },
  {
    key: "orders:write",
    label: "Siparişler — Yazma",
    desc: "Satış siparişi oluşturma",
  },
];

const SCOPE_MODULES = [
  {
    module: "products",
    label: "Ürünler",
    actions: ["read", "write", "delete"] as const,
  },
  {
    module: "contacts",
    label: "Cari Hesaplar",
    actions: ["read", "write", "delete"] as const,
  },
  {
    module: "invoices",
    label: "Faturalar",
    actions: ["read", "write", "delete"] as const,
  },
  {
    module: "orders",
    label: "Siparişler",
    actions: ["read", "write"] as const,
  },
];

const ACTION_LABELS: Record<string, string> = {
  read: "Okuma",
  write: "Yazma",
  delete: "Silme",
};

export function ApiKeysPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<ApiKey | null>(null);
  const [rawKey, setRawKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    expiresAt: "",
    scopes: [] as string[],
  });

  const { data, isLoading } = useApiKeys({ page, limit: 20 });
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  const toggleScope = (scope: string) => {
    setForm((p) => ({
      ...p,
      scopes: p.scopes.includes(scope)
        ? p.scopes.filter((s) => s !== scope)
        : [...p.scopes, scope],
    }));
  };

  const copyKey = () => {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setForm({ name: "", expiresAt: "", scopes: [] });
    setRawKey("");
    setCopied(false);
  };

  const columns: ColumnDef<ApiKey>[] = [
    {
      key: "name",
      header: "Anahtar",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              r.isActive ? "bg-amber-500/10" : "bg-slate-800"
            }`}
          >
            <Key
              className={`w-3.5 h-3.5 ${r.isActive ? "text-amber-400" : "text-slate-600"}`}
            />
          </div>
          <div>
            <span className="text-white font-medium text-sm">{r.name}</span>
            <span className="block font-mono text-[11px] text-slate-600">
              {r.keyPrefix}••••••••
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "scopes",
      header: "Erişim",
      width: "180px",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.scopes.length > 0 ? (
            r.scopes.map((s) => {
              const info = AVAILABLE_SCOPES.find((a) => a.key === s);
              return (
                <span
                  key={s}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400"
                >
                  {info?.label ?? s}
                </span>
              );
            })
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-500">
              Kapsam yok
            </span>
          )}
        </div>
      ),
    },
    {
      key: "lastUsedAt",
      header: "Son Kullanım",
      width: "120px",
      render: (r) => (
        <span className="text-slate-500 text-xs">
          {r.lastUsedAt ? formatDate(r.lastUsedAt) : "Hiç kullanılmadı"}
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: "Bitiş",
      width: "110px",
      render: (r) => {
        if (!r.expiresAt)
          return <span className="text-slate-600 text-xs">Süresiz</span>;
        const isExpired = new Date(r.expiresAt) < new Date();
        return (
          <span
            className={`text-xs ${isExpired ? "text-red-400" : "text-slate-400"}`}
          >
            {formatDate(r.expiresAt)}
          </span>
        );
      },
    },
    {
      key: "isActive",
      header: "Durum",
      width: "90px",
      render: (r) =>
        r.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="danger">İptal</Badge>
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailKey(r);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
            aria-label="Detay"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {r.isActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                revokeKey.mutate(r.id);
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              aria-label="İptal et"
            >
              <Shield className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteKey.mutate(r.id);
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

  return (
    <div>
      <PageHeader
        title="API Anahtarları"
        subtitle="Dış entegrasyonlar için API erişim anahtarlarını yönetin."
        action={
          <Button
            size="sm"
            onClick={() => {
              setCreateOpen(true);
              resetForm();
            }}
          >
            <Plus className="w-4 h-4" />
            Yeni Anahtar
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => setDetailKey(r)}
        emptyTitle="API anahtarı bulunamadı"
        emptyDescription="Dış entegrasyonlar için bir API anahtarı oluşturun."
        pagination={
          data
            ? {
                page,
                pageSize: 20,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      {/* ── Create Modal ── */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        title={rawKey ? "API Anahtarı Oluşturuldu" : "Yeni API Anahtarı"}
        description={
          rawKey
            ? undefined
            : "Anahtar oluşturun ve erişim kapsamını belirleyin."
        }
        size="md"
        footer={
          rawKey ? (
            <Button
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              Tamam
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
              >
                İptal
              </Button>
              <Button
                size="sm"
                loading={createKey.isPending}
                disabled={!form.name.trim() || form.scopes.length === 0}
                onClick={() => {
                  createKey.mutate(
                    {
                      name: form.name,
                      scopes: form.scopes,
                      expiresAt: form.expiresAt || undefined,
                    },
                    {
                      onSuccess: (data) => {
                        if (data.rawKey) setRawKey(data.rawKey);
                      },
                    },
                  );
                }}
              >
                Oluştur
              </Button>
            </>
          )
        }
      >
        {rawKey ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <p className="text-xs text-amber-400 mb-3">
                Bu anahtar sadece bir kez gösterilir. Güvenli bir yere kaydedin.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-white bg-slate-800 p-3 rounded-lg break-all select-all">
                  {rawKey}
                </code>
                <button
                  onClick={copyKey}
                  className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
            {form.scopes.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Erişim kapsamı:</p>
                <div className="flex flex-wrap gap-1">
                  {form.scopes.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-2 py-1 rounded-md bg-slate-800 text-slate-300 font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Anahtar Adı"
                required
                placeholder="ör. E-ticaret Entegrasyonu"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
              />
              <Input
                label="Bitiş Tarihi"
                type="date"
                helperText="Boş bırakırsanız süresiz olur."
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((p) => ({ ...p, expiresAt: e.target.value }))
                }
              />
            </div>

            {/* Scope matrix */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-medium text-slate-300 block">
                    Erişim Kapsamı
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    En az bir kapsam seçilmelidir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const allKeys = SCOPE_MODULES.flatMap((m) =>
                      m.actions.map((a) => `${m.module}:${a}`),
                    );
                    const allSelected = allKeys.every((k) =>
                      form.scopes.includes(k),
                    );
                    setForm((p) => ({
                      ...p,
                      scopes: allSelected ? [] : allKeys,
                    }));
                  }}
                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors flex-shrink-0"
                >
                  {SCOPE_MODULES.flatMap((m) =>
                    m.actions.map((a) => `${m.module}:${a}`),
                  ).every((k) => form.scopes.includes(k))
                    ? "Tümünü Kaldır"
                    : "Tümünü Seç"}
                </button>
              </div>
              <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/40">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Modül
                      </th>
                      <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">
                        Okuma
                      </th>
                      <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">
                        Yazma
                      </th>
                      <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">
                        Silme
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCOPE_MODULES.map((mod, i) => (
                      <tr
                        key={mod.module}
                        className={i % 2 === 1 ? "bg-slate-800/[0.08]" : ""}
                      >
                        <td className="px-4 py-2.5 text-sm text-slate-300">
                          {mod.label}
                        </td>
                        {(["read", "write", "delete"] as const).map(
                          (action) => {
                            const scopeKey = `${mod.module}:${action}`;
                            const available = (
                              mod.actions as readonly string[]
                            ).includes(action);
                            const selected = form.scopes.includes(scopeKey);
                            return (
                              <td
                                key={action}
                                className="text-center px-2 py-2.5"
                              >
                                {available ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleScope(scopeKey)}
                                    className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center transition-colors ${
                                      selected
                                        ? "bg-sky-500/15 hover:bg-red-500/15"
                                        : "bg-slate-800/60 hover:bg-sky-500/10"
                                    }`}
                                  >
                                    {selected ? (
                                      <Check className="w-3.5 h-3.5 text-sky-400" />
                                    ) : (
                                      <X className="w-3 h-3 text-slate-700" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-slate-800">—</span>
                                )}
                              </td>
                            );
                          },
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                {form.scopes.length > 0
                  ? `${form.scopes.length} kapsam seçili`
                  : "Kapsam seçilmedi — erişim yok"}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal
        isOpen={!!detailKey}
        onClose={() => setDetailKey(null)}
        title={detailKey?.name ?? "Anahtar Detayı"}
        size="sm"
        footer={
          <div className="flex items-center gap-2 w-full">
            {detailKey?.isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  revokeKey.mutate(detailKey.id);
                  setDetailKey(null);
                }}
              >
                <Shield className="w-3.5 h-3.5" />
                İptal Et
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetailKey(null)}
            >
              Kapat
            </Button>
          </div>
        }
      >
        {detailKey && (
          <div className="space-y-5">
            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3" /> Prefix
                </div>
                <code className="text-sm text-white font-mono">
                  {detailKey.keyPrefix}••••
                </code>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Durum</div>
                <div>
                  {detailKey.isActive ? (
                    <Badge variant="success">Aktif</Badge>
                  ) : (
                    <Badge variant="danger">İptal</Badge>
                  )}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Son Kullanım
                </div>
                <div className="text-sm text-white">
                  {detailKey.lastUsedAt
                    ? formatDate(detailKey.lastUsedAt)
                    : "Hiç"}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Bitiş
                </div>
                <div className="text-sm text-white">
                  {detailKey.expiresAt
                    ? formatDate(detailKey.expiresAt)
                    : "Süresiz"}
                </div>
              </div>
            </div>

            {/* Scopes */}
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-3">
                Erişim Kapsamı
              </h4>
              {detailKey.scopes.length > 0 ? (
                <div className="space-y-2">
                  {detailKey.scopes.map((s) => {
                    const info = AVAILABLE_SCOPES.find((a) => a.key === s);
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-2.5"
                      >
                        <div className="w-5 h-5 rounded-md bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <span className="text-sm text-white">
                            {info?.label ?? s}
                          </span>
                          {info && (
                            <span className="block text-[10px] text-slate-500">
                              {info.desc}
                            </span>
                          )}
                        </div>
                        <code className="text-[10px] font-mono text-slate-600">
                          {s}
                        </code>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3">
                  <span className="text-sm text-slate-400">
                    Kapsam tanımlanmamış
                  </span>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-600">
              <span>Oluşturulma: {formatDate(detailKey.createdAt)}</span>
              {detailKey.revokedAt && (
                <span>İptal: {formatDate(detailKey.revokedAt)}</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

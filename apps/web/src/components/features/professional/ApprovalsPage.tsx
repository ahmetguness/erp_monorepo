"use client";

import { useState } from "react";
import {
  Plus,
  CheckCircle,
  XCircle,
  GitBranch,
  ClipboardList,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Send,
  Sparkles,
  ShoppingCart,
  BadgeDollarSign,
  CreditCard,
  Boxes,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useUIStore } from "@/store/ui.store";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  useApprovalFlows,
  useApprovalFlow,
  useCreateApprovalFlow,
  useUpdateApprovalFlow,
  useDeleteApprovalFlow,
  useApprovalRequests,
  useCreateApprovalRequest,
  useAddApprovalAction,
} from "@/hooks/useApprovals";
import { formatDate } from "@/lib/utils";
import type {
  ApprovalFlow,
  ApprovalRequest,
  ApprovalModule,
} from "@/services/approval.service";

const MODULE_MAP: Record<string, string> = {
  PURCHASE_REQUEST: "Satın Alma Talebi",
  LEAVE_REQUEST: "İzin Talebi",
  INVOICE: "Fatura",
  SALES_ORDER: "Satış Siparişi",
  PURCHASE_ORDER: "Satın Alma Siparişi",
  SERVICE_REQUEST: "Servis Talebi",
  OTHER: "Diğer",
};

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "neutral" | "success" | "warning" | "danger" | "info";
  }
> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  APPROVED: { label: "Onaylı", variant: "success" },
  REJECTED: { label: "Reddedildi", variant: "danger" },
  CANCELLED: { label: "İptal", variant: "neutral" },
  ESCALATED: { label: "Yükseltildi", variant: "info" },
};

const ENTITY_TYPES = [
  { value: "PURCHASE_ORDER", label: "Satın Alma Siparişi" },
  { value: "SALES_ORDER", label: "Satış Siparişi" },
  { value: "INVOICE", label: "Fatura" },
  { value: "SERVICE_REQUEST", label: "Servis Talebi" },
  { value: "OTHER", label: "Diğer" },
];

const APPROVAL_TEMPLATES = [
  {
    name: "Satın Alma Onayı",
    module: "PURCHASE_ORDER" as ApprovalModule,
    description: "Satın alma siparişleri için kademeli onay akışı.",
    icon: ShoppingCart,
    steps: [
      { stepOrder: 1, name: "Departman Müdürü Onayı", isRequired: true },
      { stepOrder: 2, name: "Finans Direktörü Onayı", isRequired: true },
      { stepOrder: 3, name: "Genel Müdür Onayı", isRequired: true },
    ],
  },
  {
    name: "Satış İskonto Onayı",
    module: "SALES_ORDER" as ApprovalModule,
    description: "Büyük iskonto oranlı satış siparişleri için onay akışı.",
    icon: BadgeDollarSign,
    steps: [
      { stepOrder: 1, name: "Satış Müdürü Onayı", isRequired: true },
      { stepOrder: 2, name: "Finans Müdürü Onayı", isRequired: true },
    ],
  },
  {
    name: "Ödeme Onay Akışı",
    module: "INVOICE" as ApprovalModule,
    description: "Tedarikçi fatura ödemeleri ve banka çıkışları için onay akışı.",
    icon: CreditCard,
    steps: [
      { stepOrder: 1, name: "Muhasebe Yetkilisi Onayı", isRequired: true },
      { stepOrder: 2, name: "CFO Onayı", isRequired: true },
    ],
  },
  {
    name: "Stok Düzeltme Onayı",
    module: "OTHER" as ApprovalModule,
    description: "Sayım farkları ve stok düzeltme fişleri için onay akışı.",
    icon: Boxes,
    steps: [
      { stepOrder: 1, name: "Depo Sorumlusu Onayı", isRequired: true },
      { stepOrder: 2, name: "Operasyon Müdürü Onayı", isRequired: true },
    ],
  },
];

export function ApprovalsPage() {
  const { toast } = useUIStore();
  const [tab, setTab] = useState<"flows" | "requests">("flows");
  const [flowPage, setFlowPage] = useState(1);
  const [reqPage, setReqPage] = useState(1);

  // Modals
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [createReqOpen, setCreateReqOpen] = useState(false);
  const [detailFlowId, setDetailFlowId] = useState<string | null>(null);

  // Forms
  const [flowForm, setFlowForm] = useState({
    name: "",
    module: "PURCHASE_REQUEST" as ApprovalModule,
    stepName: "",
  });
  const [reqForm, setReqForm] = useState({
    flowId: "",
    entityType: "PURCHASE_ORDER",
    entityId: "",
    notes: "",
  });

  // Queries
  const { data: flowsData, isLoading: flowsLoading } = useApprovalFlows({
    page: flowPage,
    limit: 20,
  });
  const { data: reqsData, isLoading: reqsLoading } = useApprovalRequests({
    page: reqPage,
    limit: 20,
  });
  const { data: detailFlow } = useApprovalFlow(detailFlowId ?? "");

  // Mutations
  const createFlow = useCreateApprovalFlow();
  const updateFlow = useUpdateApprovalFlow();
  const deleteFlow = useDeleteApprovalFlow();
  const createReq = useCreateApprovalRequest();
  const addAction = useAddApprovalAction();

  const flowCount = flowsData?.meta.total ?? 0;
  const reqCount = reqsData?.meta.total ?? 0;

  // ── Flow columns ──

  const flowColumns: ColumnDef<ApprovalFlow>[] = [
    {
      key: "name",
      header: "Akış Adı",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div>
            <span className="text-white font-medium text-sm">{r.name}</span>
            <span className="block text-xs text-slate-500">
              {MODULE_MAP[r.module] ?? r.module}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "steps",
      header: "Adım",
      width: "80px",
      align: "center",
      render: (r) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
          {r.steps?.length ?? 0}
        </span>
      ),
    },
    {
      key: "requests",
      header: "Talep",
      width: "80px",
      align: "center",
      render: (r) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
          {r._count?.requests ?? 0}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "100px",
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
      width: "110px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailFlowId(r.id);
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
            aria-label="Detay"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateFlow.mutate({ id: r.id, data: { isActive: !r.isActive } });
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            aria-label={r.isActive ? "Pasife al" : "Aktife al"}
          >
            {r.isActive ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteFlow.mutate(r.id);
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

  // ── Request columns ──

  const reqColumns: ColumnDef<ApprovalRequest>[] = [
    {
      key: "flow",
      header: "Akış",
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">
            {r.flow?.name ?? "—"}
          </span>
          <span className="block text-xs text-slate-500">
            {MODULE_MAP[r.flow?.module ?? ""] ?? r.flow?.module}
          </span>
        </div>
      ),
    },
    {
      key: "entityId",
      header: "Kaynak",
      width: "130px",
      render: (r) => (
        <code className="text-xs text-slate-500 bg-slate-800/60 px-2 py-1 rounded-md">
          {r.entityId.slice(0, 8)}…
        </code>
      ),
    },
    {
      key: "currentStep",
      header: "Adım",
      width: "70px",
      align: "center",
      render: (r) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
          {r.currentStep}
        </span>
      ),
    },
    {
      key: "status",
      header: "Durum",
      width: "130px",
      render: (r) => {
        const s = STATUS_MAP[r.status];
        return s ? (
          <Badge variant={s.variant}>{s.label}</Badge>
        ) : (
          <span>{r.status}</span>
        );
      },
    },
    {
      key: "createdAt",
      header: "Tarih",
      width: "110px",
      render: (r) => (
        <span className="text-slate-500 text-xs">
          {formatDate(r.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "170px",
      align: "right",
      render: (r) =>
        r.status === "PENDING" ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addAction.mutate({
                  requestId: r.id,
                  data: { actionType: "APPROVE" },
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Onayla
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addAction.mutate({
                  requestId: r.id,
                  data: { actionType: "REJECT" },
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reddet
            </button>
          </div>
        ) : null,
    },
  ];

  // ── Tabs config ──

  const tabs = [
    {
      id: "flows" as const,
      label: "Akışlar",
      icon: GitBranch,
      count: flowCount,
    },
    {
      id: "requests" as const,
      label: "Talepler",
      icon: ClipboardList,
      count: reqCount,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Onay Akışları"
        subtitle="Onay süreçlerini ve taleplerini yönetin."
        action={
          <div className="flex items-center gap-2">
            {tab === "requests" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateReqOpen(true)}
              >
                <Send className="w-4 h-4" />
                Yeni Talep
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateFlowOpen(true)}>
              <Plus className="w-4 h-4" />
              Yeni Akış
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                  tab === t.id
                    ? "bg-sky-500/15 text-sky-400"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tables */}
      {tab === "flows" && (
        <div className="space-y-6">
          {/* Templates Section */}
          <div className="space-y-3 bg-slate-950/20 border border-slate-800/80 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800/60 pb-3 mb-1">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Hazır Onay Akışı Şablonları
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {APPROVAL_TEMPLATES.map((tmpl, idx) => {
                const TmplIcon = tmpl.icon;
                return (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 hover:shadow-lg transition-all duration-300 group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:bg-slate-800/80 transition-colors">
                          <TmplIcon className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-850 px-2 py-0.5 rounded-full border border-slate-800/60 uppercase">
                          {MODULE_MAP[tmpl.module] ?? tmpl.module}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white group-hover:text-sky-400 transition-colors">
                          {tmpl.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                          {tmpl.description}
                        </p>
                      </div>

                      {/* steps list */}
                      <div className="pt-2 space-y-1.5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Akış Adımları:
                        </span>
                        {tmpl.steps.map((st) => (
                          <div key={st.stepOrder} className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="w-3.5 h-3.5 rounded bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[8px] shrink-0 border border-slate-750">
                              {st.stepOrder}
                            </span>
                            <span className="truncate">{st.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        createFlow.mutate({
                          name: tmpl.name,
                          module: tmpl.module,
                          steps: tmpl.steps,
                        }, {
                          onSuccess: () => {
                            toast.success(`"${tmpl.name}" şablondan başarıyla oluşturuldu.`);
                          }
                        });
                      }}
                      disabled={createFlow.isPending}
                      className="mt-4 w-full text-center py-2 rounded-lg text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 disabled:opacity-50 transition-all duration-200"
                    >
                      Şablonu Uygula
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <DataTable
            columns={flowColumns}
            data={flowsData?.data ?? []}
            keyExtractor={(r) => r.id}
            isLoading={flowsLoading}
            emptyTitle="Onay akışı bulunamadı"
            emptyDescription="Yeni bir onay akışı oluşturarak başlayın."
            pagination={
              flowsData
                ? {
                    page: flowPage,
                    pageSize: 20,
                    total: flowsData.meta.total,
                    totalPages: flowsData.meta.totalPages,
                    onChange: setFlowPage,
                  }
                : undefined
            }
          />
        </div>
      )}
      {tab === "requests" && (
        <DataTable
          columns={reqColumns}
          data={reqsData?.data ?? []}
          keyExtractor={(r) => r.id}
          isLoading={reqsLoading}
          emptyTitle="Onay talebi bulunamadı"
          emptyDescription="Henüz onay talebi yok."
          pagination={
            reqsData
              ? {
                  page: reqPage,
                  pageSize: 20,
                  total: reqsData.meta.total,
                  totalPages: reqsData.meta.totalPages,
                  onChange: setReqPage,
                }
              : undefined
          }
        />
      )}

      {/* ── Create Flow Modal ── */}
      <Modal
        isOpen={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        title="Yeni Onay Akışı"
        description="Bir onay süreci tanımlayın. Sonradan adım ekleyebilirsiniz."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateFlowOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={createFlow.isPending}
              disabled={!flowForm.name.trim()}
              onClick={() => {
                createFlow.mutate(
                  {
                    name: flowForm.name,
                    module: flowForm.module,
                    steps: [
                      {
                        stepOrder: 1,
                        name: flowForm.stepName || "Onay Adımı 1",
                      },
                    ],
                  },
                  {
                    onSuccess: () => {
                      setCreateFlowOpen(false);
                      setFlowForm({
                        name: "",
                        module: "PURCHASE_REQUEST",
                        stepName: "",
                      });
                    },
                  },
                );
              }}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Akış Adı"
            required
            placeholder="ör. Satın Alma Onayı"
            value={flowForm.name}
            onChange={(e) =>
              setFlowForm((p) => ({ ...p, name: e.target.value }))
            }
          />
          <Select
            label="Modül"
            required
            options={Object.entries(MODULE_MAP).map(([k, v]) => ({
              value: k,
              label: v,
            }))}
            value={flowForm.module}
            onChange={(e) =>
              setFlowForm((p) => ({
                ...p,
                module: e.target.value as ApprovalModule,
              }))
            }
          />
          <Input
            label="İlk Adım Adı"
            placeholder="Onay Adımı 1"
            helperText="Boş bırakırsanız varsayılan isim kullanılır."
            value={flowForm.stepName}
            onChange={(e) =>
              setFlowForm((p) => ({ ...p, stepName: e.target.value }))
            }
          />
        </div>
      </Modal>

      {/* ── Create Request Modal ── */}
      <Modal
        isOpen={createReqOpen}
        onClose={() => setCreateReqOpen(false)}
        title="Yeni Onay Talebi"
        description="Bir onay akışına bağlı talep oluşturun."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateReqOpen(false)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={createReq.isPending}
              disabled={!reqForm.flowId || !reqForm.entityId.trim()}
              onClick={() => {
                createReq.mutate(
                  {
                    flowId: reqForm.flowId,
                    entityType: reqForm.entityType,
                    entityId: reqForm.entityId,
                    notes: reqForm.notes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateReqOpen(false);
                      setReqForm({
                        flowId: "",
                        entityType: "PURCHASE_ORDER",
                        entityId: "",
                        notes: "",
                      });
                      setTab("requests");
                    },
                  },
                );
              }}
            >
              Talep Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Select
            label="Onay Akışı"
            required
            placeholder="Akış seçin"
            options={(flowsData?.data ?? [])
              .filter((f) => f.isActive)
              .map((f) => ({
                value: f.id,
                label: `${f.name} (${MODULE_MAP[f.module] ?? f.module})`,
              }))}
            value={reqForm.flowId}
            onChange={(e) =>
              setReqForm((p) => ({ ...p, flowId: e.target.value }))
            }
          />
          <Select
            label="Kaynak Tipi"
            required
            options={ENTITY_TYPES}
            value={reqForm.entityType}
            onChange={(e) =>
              setReqForm((p) => ({ ...p, entityType: e.target.value }))
            }
          />
          <Input
            label="Kaynak ID"
            required
            placeholder="İlgili kaydın ID'si"
            value={reqForm.entityId}
            onChange={(e) =>
              setReqForm((p) => ({ ...p, entityId: e.target.value }))
            }
          />
          <Input
            label="Not"
            placeholder="Opsiyonel açıklama"
            value={reqForm.notes}
            onChange={(e) =>
              setReqForm((p) => ({ ...p, notes: e.target.value }))
            }
          />
        </div>
      </Modal>

      {/* ── Flow Detail Modal ── */}
      <Modal
        isOpen={!!detailFlowId}
        onClose={() => setDetailFlowId(null)}
        title={detailFlow?.name ?? "Akış Detayı"}
        description={
          detailFlow
            ? `${MODULE_MAP[detailFlow.module] ?? detailFlow.module} — ${detailFlow.isActive ? "Aktif" : "Pasif"}`
            : undefined
        }
        size="md"
        footer={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailFlowId(null)}
          >
            Kapat
          </Button>
        }
      >
        {detailFlow ? (
          <div className="space-y-6">
            {/* Info row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Modül</div>
                <div className="text-sm text-white font-medium">
                  {MODULE_MAP[detailFlow.module] ?? detailFlow.module}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">
                  Adım Sayısı
                </div>
                <div className="text-sm text-white font-medium">
                  {detailFlow.steps?.length ?? 0}
                </div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Durum</div>
                <div>
                  {detailFlow.isActive ? (
                    <Badge variant="success">Aktif</Badge>
                  ) : (
                    <Badge variant="neutral">Pasif</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Steps */}
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-3">
                Onay Adımları
              </h4>
              {detailFlow.steps && detailFlow.steps.length > 0 ? (
                <div className="space-y-2">
                  {detailFlow.steps.map((step, i) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3"
                    >
                      <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{step.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {step.approverRole && (
                            <span className="text-[10px] text-slate-500">
                              Rol: {step.approverRole.name}
                            </span>
                          )}
                          {step.approverUser && (
                            <span className="text-[10px] text-slate-500">
                              Kullanıcı: {step.approverUser.name}
                            </span>
                          )}
                          {!step.approverRole && !step.approverUser && (
                            <span className="text-[10px] text-slate-600">
                              Atanmamış
                            </span>
                          )}
                        </div>
                      </div>
                      {step.isRequired && <Badge variant="info">Zorunlu</Badge>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Henüz adım tanımlanmamış.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </Modal>
    </div>
  );
}

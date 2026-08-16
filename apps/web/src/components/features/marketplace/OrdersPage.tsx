"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  useMarketplaceOrders,
  useMarketplaceOrder,
  useChangeOrderStatus,
} from "@/hooks/useMarketplace";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { MarketplaceOrder } from "@/services/marketplace.service";

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  PROCESSING: { label: "İşleniyor", variant: "info" },
  SHIPPED: { label: "Kargoda", variant: "info" },
  DELIVERED: { label: "Teslim edildi", variant: "success" },
  CANCELLED: { label: "İptal", variant: "danger" },
  RETURNED: { label: "İade", variant: "neutral" },
  REFUNDED: { label: "İade edildi", variant: "neutral" },
};

const CHANNEL_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  AMAZON: "Amazon",
  CICEKSEPETI: "Çiçeksepeti",
  OTHER: "Diğer",
};

const STATUS_FILTERS = ["", "PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"];

function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export function MarketplaceOrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<MarketplaceOrder | null>(null);
  const [newStatus, setNewStatus] = useState("");

  const { data, isLoading, isFetching, refetch } = useMarketplaceOrders({
    page,
    limit: 20,
    ...(statusFilter && { status: statusFilter }),
  });
  const { data: detail } = useMarketplaceOrder(detailId ?? "");
  const changeStatus = useChangeOrderStatus();

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const summary = useMemo(() => ({
    total: data?.meta.total ?? rows.length,
    pending: rows.filter((order) => order.status === "PENDING").length,
    processing: rows.filter((order) => order.status === "PROCESSING").length,
    shipped: rows.filter((order) => order.status === "SHIPPED").length,
    exceptions: rows.filter((order) => ["CANCELLED", "RETURNED", "REFUNDED"].includes(order.status)).length,
    amount: rows.reduce((total, order) => total + Number(order.totalAmount), 0),
  }), [data?.meta.total, rows]);

  const columns: ColumnDef<MarketplaceOrder>[] = [
    {
      key: "externalId",
      header: "Sipariş",
      width: "145px",
      render: (order) => (
        <div>
          <code className="font-mono text-xs text-sky-300">{order.externalId}</code>
          <span className="mt-1 block text-[11px] text-slate-500">{formatDate(order.orderDate)}</span>
        </div>
      ),
    },
    {
      key: "channel",
      header: "Kanal",
      width: "145px",
      render: (order) => (
        <div>
          <Badge variant="info">{channelLabel(order.channel)}</Badge>
          <span className="mt-1 block truncate text-[11px] text-slate-500">{order.integration?.name ?? "-"}</span>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Müşteri",
      render: (order) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{order.customerName ?? "-"}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{order.customerPhone ?? order.customerEmail ?? "-"}</span>
        </div>
      ),
    },
    {
      key: "items",
      header: "Kalem",
      width: "85px",
      align: "right",
      render: (order) => <span className="tabular-nums text-slate-300">{order._count?.items ?? order.items?.length ?? 0}</span>,
    },
    {
      key: "totalAmount",
      header: "Tutar",
      width: "125px",
      align: "right",
      render: (order) => <span className="font-medium tabular-nums text-white">{formatCurrency(order.totalAmount)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "135px",
      render: (order) => {
        const status = STATUS_MAP[order.status];
        return status ? <Badge variant={status.variant}>{status.label}</Badge> : <span className="text-slate-400">{order.status}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      width: "52px",
      align: "right",
      render: (order) => (
        <button
          onClick={(event) => {
            event.stopPropagation();
            setDetailId(order.id);
          }}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
          aria-label="Detay"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pazaryeri siparişleri"
        subtitle="E-ticaret kanallarından gelen siparişleri durum, kanal ve tutar bazında takip edin."
        className="mb-0"
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Yenile
          </Button>
        }
      />

      <SummaryStrip
        metrics={[
          { label: "Toplam Sipariş", value: summary.total, tone: "text-slate-50" },
          { label: "Bekleyen", value: summary.pending, tone: summary.pending > 0 ? "text-amber-300" : "text-slate-200" },
          { label: "İşleniyor", value: summary.processing, tone: "text-sky-200" },
          { label: "Kargoda", value: summary.shipped, tone: "text-violet-300" },
          { label: "İstisna", value: summary.exceptions, tone: summary.exceptions > 0 ? "text-red-300" : "text-slate-200" },
          { label: "Sayfa Tutarı", value: formatCurrency(summary.amount), tone: "text-emerald-300" },
        ]}
      />

      {summary.exceptions > 0 && <AttentionBar count={summary.exceptions} />}

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-white">Sipariş listesi</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950/45 p-1">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status || "all"}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === status ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300",
                )}
              >
                {status ? statusLabel(status) : "Tümü"}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(order) => order.id}
            isLoading={isLoading}
            density="compact"
            onRowClick={(order) => setDetailId(order.id)}
            emptyTitle="Pazaryeri siparişi bulunamadı"
            emptyDescription="Entegrasyonlar aktif olduğunda siparişler burada görünecek."
            pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
          />
        </div>
      </section>

      <OrderDetailModal
        detailId={detailId}
        detail={detail}
        onClose={() => setDetailId(null)}
        onChangeStatus={(order) => {
          setStatusModal(order);
          setNewStatus("");
          setDetailId(null);
        }}
      />

      <Modal
        isOpen={!!statusModal}
        onClose={() => setStatusModal(null)}
        title="Sipariş durumu değiştir"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setStatusModal(null)}>İptal</Button>
            <Button
              size="sm"
              loading={changeStatus.isPending}
              disabled={!newStatus}
              onClick={() => {
                if (!statusModal) return;
                changeStatus.mutate(
                  { id: statusModal.id, data: { status: newStatus } },
                  { onSuccess: () => setStatusModal(null) },
                );
              }}
            >
              Güncelle
            </Button>
          </>
        }
      >
        <Select
          label="Yeni durum"
          required
          options={Object.entries(STATUS_MAP).map(([key, value]) => ({ value: key, label: value.label }))}
          value={newStatus}
          onChange={(event) => setNewStatus(event.target.value)}
        />
      </Modal>
    </div>
  );
}

function OrderDetailModal({
  detailId,
  detail,
  onClose,
  onChangeStatus,
}: {
  detailId: string | null;
  detail?: MarketplaceOrder;
  onClose: () => void;
  onChangeStatus: (order: MarketplaceOrder) => void;
}) {
  return (
    <Modal
      isOpen={!!detailId}
      onClose={onClose}
      title={detail ? `Sipariş ${detail.externalId}` : "Sipariş detayı"}
      size="md"
      footer={
        <div className="flex w-full items-center gap-2">
          {detail && !["DELIVERED", "CANCELLED", "REFUNDED"].includes(detail.status) && (
            <Button variant="ghost" size="sm" onClick={() => onChangeStatus(detail)}>
              Durum değiştir
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>Kapat</Button>
        </div>
      }
    >
      {detail ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Kanal", value: channelLabel(detail.channel) },
              { label: "Durum", value: statusLabel(detail.status) },
              { label: "Müşteri", value: detail.customerName ?? "-" },
              { label: "Tutar", value: formatCurrency(detail.totalAmount) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/35 px-4 py-3">
                <div className="mb-1 text-[10px] uppercase text-slate-500">{item.label}</div>
                <div className="text-sm text-white">{item.value}</div>
              </div>
            ))}
          </div>
          {detail.shippingAddress && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-4 py-3">
              <div className="mb-1 text-[10px] uppercase text-slate-500">Teslimat adresi</div>
              <div className="text-sm text-slate-300">{detail.shippingAddress}</div>
            </div>
          )}
          {detail.items && detail.items.length > 0 && (
            <div>
              <h4 className="mb-3 text-xs font-medium text-slate-400">Kalemler</h4>
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/35 px-4 py-3">
                    <div className="min-w-0">
                      <span className="block truncate text-sm text-white">{item.name}</span>
                      {item.product && <span className="block font-mono text-xs text-slate-500">{item.product.code}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-white">{item.quantity} x {formatCurrency(item.unitPrice)}</span>
                      <span className="block text-xs text-slate-400">{formatCurrency(item.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </div>
      )}
    </Modal>
  );
}

function SummaryStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; tone: string }> }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="flex items-center gap-x-4">
            {index > 0 && <span className="h-4 w-px bg-slate-800" />}
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBar({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Siparişlerde takip isteyen <strong className="font-semibold">{count} iptal/iade kaydı</strong> var.
        </span>
      </div>
    </div>
  );
}

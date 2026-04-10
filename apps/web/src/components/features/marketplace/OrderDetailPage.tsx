"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useMarketplaceOrder } from "@/hooks/useMarketplace";
import { formatDate, formatCurrency } from "@/lib/utils";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "neutral" | "success" | "warning" | "danger" | "info";
  }
> = {
  PENDING: { label: "Bekliyor", variant: "warning" },
  PROCESSING: { label: "İşleniyor", variant: "info" },
  SHIPPED: { label: "Kargoda", variant: "info" },
  DELIVERED: { label: "Teslim Edildi", variant: "success" },
  CANCELLED: { label: "İptal", variant: "danger" },
  RETURNED: { label: "İade", variant: "neutral" },
  REFUNDED: { label: "İade Edildi", variant: "neutral" },
};

export function OrderDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: order, isLoading } = useMarketplaceOrder(id);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!order)
    return (
      <div className="text-center py-20 text-slate-400">
        Sipariş bulunamadı.
      </div>
    );

  const s = STATUS_MAP[order.status];

  return (
    <div>
      <PageHeader
        title={`Sipariş ${order.externalId}`}
        subtitle={order.integration?.name ?? order.channel}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Durum",
            value: s ? (
              <Badge variant={s.variant}>{s.label}</Badge>
            ) : (
              order.status
            ),
          },
          { label: "Müşteri", value: order.customerName ?? "—" },
          { label: "Tutar", value: formatCurrency(order.totalAmount) },
          { label: "Tarih", value: formatDate(order.orderDate) },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
          >
            <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
            <div className="text-sm text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {order.shippingAddress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-2">
            Teslimat Adresi
          </h3>
          <p className="text-sm text-slate-300">{order.shippingAddress}</p>
        </div>
      )}

      {order.items && order.items.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Kalemler</h3>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-white">{item.name}</span>
                  {item.product && (
                    <span className="block text-xs text-slate-500 font-mono">
                      {item.product.code}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm text-white">
                    {item.quantity} × {formatCurrency(item.unitPrice)}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

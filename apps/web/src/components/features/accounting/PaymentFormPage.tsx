"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";

export function PaymentFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type"); // 'receive' | 'send'
  const contactId = searchParams.get("contactId");

  const isReceive = type === "receive";
  const title = isReceive ? "Tahsilat Al" : "Ödeme Yap";
  const Icon = isReceive ? ArrowDownLeft : ArrowUpRight;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={contactId ? `Cari Hesap: ${contactId}` : undefined}
        action={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => router.back()}
          >
            Geri
          </Button>
        }
      />

      <div className="max-w-2xl">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
          <div
            className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center ${isReceive ? "bg-emerald-500/10" : "bg-red-500/10"}`}
          >
            <Icon
              className={`w-6 h-6 ${isReceive ? "text-emerald-400" : "text-red-400"}`}
            />
          </div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400">
            Bu sayfa yakında aktif olacak. Şu an ödeme işlemleri Ödemeler
            modülünden yapılabilir.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => router.push("/dashboard/payments")}
            >
              Ödemeler Sayfasına Git
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>
              Geri Dön
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

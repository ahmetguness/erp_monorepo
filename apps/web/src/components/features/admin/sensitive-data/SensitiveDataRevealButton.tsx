"use client";
import type { AdminAccessPurpose, AdminSensitiveField } from "@repo/types";
import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { toastAdminError } from "@/lib/admin/errors";
import { revealSensitiveData } from "@/services/admin-sensitive-data.service";
import { toast } from "@/store/ui.store";
const purposes: Array<{ value: AdminAccessPurpose; label: string }> = [{ value: "SUPPORT_CASE", label: "Destek vakası" }, { value: "SECURITY_INVESTIGATION", label: "Güvenlik incelemesi" }, { value: "BILLING_VALIDATION", label: "Faturalama doğrulaması" }, { value: "INCIDENT_RESPONSE", label: "Olay müdahalesi" }];
export function SensitiveDataRevealButton({ tenantId, fields, onGranted }: { tenantId: string; fields: AdminSensitiveField[]; onGranted: () => void }) {
  const [open, setOpen] = useState(false); const [purpose, setPurpose] = useState<AdminAccessPurpose>("SUPPORT_CASE"); const [reason, setReason] = useState("");
  const grant = useMutation({ mutationFn: () => revealSensitiveData({ tenantId, fields, purpose, reason }), onSuccess: (value) => { toast.success(`Hassas veri erişimi ${new Date(value.expiresAt).toLocaleTimeString("tr-TR")} saatine kadar açıldı.`); setOpen(false); setReason(""); onGranted(); }, onError: (error) => toastAdminError(error, "Hassas veri erişimi açılamadı.") });
  return <><Button size="sm" variant="outline" leftIcon={<Eye className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Hassas veriyi göster</Button><Modal isOpen={open} onClose={() => setOpen(false)} title="Süreli hassas veri erişimi" description="Erişim 15 dakika geçerlidir ve denetim kaydına yazılır."><div className="space-y-3"><label className="block text-sm text-slate-300">Erişim amacı<select className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={purpose} onChange={(event) => setPurpose(event.target.value as AdminAccessPurpose)}>{purposes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block text-sm text-slate-300">Gerekçe<textarea className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button loading={grant.isPending} disabled={reason.trim().length < 10} onClick={() => grant.mutate()}>15 dakika göster</Button></div></Modal></>;
}

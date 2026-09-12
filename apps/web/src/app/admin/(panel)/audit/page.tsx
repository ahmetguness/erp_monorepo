import { PlatformAuditPage } from "@/components/features/admin/audit/PlatformAuditPage";
import { Suspense } from "react";

export default function AuditPage() { return <Suspense fallback={<p className="p-6 text-sm text-slate-400">Denetim kayıtları yükleniyor…</p>}><PlatformAuditPage /></Suspense>; }

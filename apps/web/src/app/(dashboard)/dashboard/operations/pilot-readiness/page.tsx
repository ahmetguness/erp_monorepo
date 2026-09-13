import type { Metadata } from "next";
import { PilotReadinessDashboard } from "@/features/pilot-readiness";

export const metadata: Metadata = {
  title: "Pilot GO / NO-GO — Axon ERP",
  description: "Pilot geçiş kriterleri, doğrulama kanıtları ve blokajlar",
};

export default function PilotReadinessPage() {
  return <PilotReadinessDashboard />;
}

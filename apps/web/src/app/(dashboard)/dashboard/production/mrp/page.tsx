import type { Metadata } from 'next';
import { MrpPlanningPage } from '@/components/features/production/MrpPlanningPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'MRP ve Üretim Planlama — Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="production" plan="ENTERPRISE">
      <MrpPlanningPage />
    </FeatureGate>
  );
}

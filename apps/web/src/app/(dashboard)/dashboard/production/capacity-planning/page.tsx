import type { Metadata } from 'next';
import { CapacityPlanningPage } from '@/components/features/production/CapacityPlanningPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'Kapasite Planlama — Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="production" plan="ENTERPRISE">
      <CapacityPlanningPage />
    </FeatureGate>
  );
}

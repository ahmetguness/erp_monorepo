import type { Metadata } from 'next';
import { AdvancedHrPage } from '@/components/features/hr/AdvancedHrPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'Gelismis IK - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="hr" plan="ENTERPRISE">
      <AdvancedHrPage />
    </FeatureGate>
  );
}

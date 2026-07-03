import type { Metadata } from 'next';
import { FieldServiceMobileFlowPage } from '@/components/features/service/FieldServiceMobileFlowPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'Saha Servis Mobil Akisi - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="service" plan="ENTERPRISE">
      <FieldServiceMobileFlowPage />
    </FeatureGate>
  );
}

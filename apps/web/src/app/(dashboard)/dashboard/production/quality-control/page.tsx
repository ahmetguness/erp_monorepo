import type { Metadata } from 'next';
import { QualityControlPage } from '@/components/features/production/QualityControlPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'Kalite Kontrol - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="production" plan="ENTERPRISE">
      <QualityControlPage />
    </FeatureGate>
  );
}

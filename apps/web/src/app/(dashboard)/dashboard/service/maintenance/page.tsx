import type { Metadata } from 'next';
import { MaintenanceManagementPage } from '@/components/features/service/MaintenanceManagementPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'Bakim Yonetimi - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="service" plan="ENTERPRISE">
      <MaintenanceManagementPage />
    </FeatureGate>
  );
}

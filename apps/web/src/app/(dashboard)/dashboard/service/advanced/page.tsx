import { FeatureGate } from '@/components/shared/FeatureGate';
import { AdvancedServicePage } from '@/components/features/service/AdvancedServicePage';

export default function Page() {
  return (
    <FeatureGate feature="service" plan="ENTERPRISE">
      <AdvancedServicePage />
    </FeatureGate>
  );
}

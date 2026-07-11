import { FeatureGate } from '@/components/shared/FeatureGate';
import { AdvancedProductionPage } from '@/components/features/production/AdvancedProductionPage';

export default function Page() {
  return (
    <FeatureGate feature="production" plan="ENTERPRISE">
      <AdvancedProductionPage />
    </FeatureGate>
  );
}

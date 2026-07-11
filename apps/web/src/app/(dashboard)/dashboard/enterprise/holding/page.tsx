import { FeatureGate } from '@/components/shared/FeatureGate';
import { HoldingCompanyPage } from '@/components/features/enterprise/HoldingCompanyPage';

export default function Page() {
  return (
    <FeatureGate plan="ENTERPRISE">
      <HoldingCompanyPage />
    </FeatureGate>
  );
}

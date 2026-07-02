import { BulkOperationsPage } from '@/components/features/professional/BulkOperationsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export default function Page() {
  return (
    <FeatureGate plan="PROFESSIONAL">
      <BulkOperationsPage />
    </FeatureGate>
  );
}

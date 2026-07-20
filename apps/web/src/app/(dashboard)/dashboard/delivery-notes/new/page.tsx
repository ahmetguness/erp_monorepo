import { FeatureGate } from '@/components/shared/FeatureGate';
import { DeliveryNoteFormPage } from '@/components/features/professional/DeliveryNoteFormPage';

export default function Page() {
  return (
    <FeatureGate plan="PROFESSIONAL">
      <DeliveryNoteFormPage />
    </FeatureGate>
  );
}

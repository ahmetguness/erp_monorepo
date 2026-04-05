import { DeliveryNotesPage } from '@/components/features/professional/DeliveryNotesPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><DeliveryNotesPage /></FeatureGate>; }

import { ReconciliationsPage } from '@/components/features/professional/ReconciliationsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><ReconciliationsPage /></FeatureGate>; }

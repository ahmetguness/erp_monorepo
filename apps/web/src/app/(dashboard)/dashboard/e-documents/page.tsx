import { EDocumentsPage } from '@/components/features/professional/EDocumentsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><EDocumentsPage /></FeatureGate>; }

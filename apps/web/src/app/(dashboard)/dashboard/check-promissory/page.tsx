import { CheckPromissoryPage } from '@/components/features/professional/CheckPromissoryPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><CheckPromissoryPage /></FeatureGate>; }

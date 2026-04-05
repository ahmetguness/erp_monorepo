import { LotSerialsPage } from '@/components/features/professional/LotSerialsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><LotSerialsPage /></FeatureGate>; }

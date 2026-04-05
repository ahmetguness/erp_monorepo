import { ProductBatchesPage } from '@/components/features/professional/ProductBatchesPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><ProductBatchesPage /></FeatureGate>; }

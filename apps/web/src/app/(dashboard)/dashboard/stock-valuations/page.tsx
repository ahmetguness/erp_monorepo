import { StockValuationPage } from '@/components/features/professional/StockValuationPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><StockValuationPage /></FeatureGate>; }

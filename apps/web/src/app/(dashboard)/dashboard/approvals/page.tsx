import { ApprovalsPage } from '@/components/features/professional/ApprovalsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate feature="approvals" plan="PROFESSIONAL"><ApprovalsPage /></FeatureGate>; }

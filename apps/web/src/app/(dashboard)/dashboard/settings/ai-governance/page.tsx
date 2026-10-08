import type { Metadata } from 'next';
import { AiGovernancePage } from '@/components/features/settings/AiGovernancePage';
import { FeatureGate } from '@/components/shared/FeatureGate';

export const metadata: Metadata = { title: 'AI Governance - Axon ERP' };

export default function Page() {
  return <FeatureGate plan="ENTERPRISE"><AiGovernancePage /></FeatureGate>;
}

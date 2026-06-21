import type { Metadata } from 'next';
import { AiGovernancePage } from '@/components/features/settings/AiGovernancePage';

export const metadata: Metadata = { title: 'AI Governance - Axon ERP' };

export default function Page() {
  return <AiGovernancePage />;
}

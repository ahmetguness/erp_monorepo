import type { Metadata } from 'next';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { DocumentCenterPage } from '@/components/features/documents/DocumentCenterPage';

export const metadata: Metadata = { title: 'Doküman Merkezi - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="documentCenter">
      <DocumentCenterPage />
    </FeatureGate>
  );
}

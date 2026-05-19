import type { Metadata } from 'next';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { MailCenterPage } from '@/components/features/mail/MailCenterPage';

export const metadata: Metadata = { title: 'Mail Merkezi - Axon ERP' };

export default function Page() {
  return (
    <FeatureGate feature="hr" plan="ENTERPRISE">
      <MailCenterPage />
    </FeatureGate>
  );
}

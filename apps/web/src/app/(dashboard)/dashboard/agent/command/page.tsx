import { Metadata } from 'next';
import { AgentCommandCenter } from '@/components/features/agent/AgentCommandCenter';

export const metadata: Metadata = {
  title: 'Otonom ERP Komut Ajanı | AXON ERP',
  description: 'Doğal dille çok adımlı komut ayrıştırma ve kendi kendine iyileşen iş süreçleri',
};

export default function AgentCommandPage() {
  return <AgentCommandCenter />;
}

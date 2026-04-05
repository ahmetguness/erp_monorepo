import type { Metadata } from 'next';
import { OrderDetailPage } from '@/components/features/marketplace/OrderDetailPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Pazaryeri Sipariş Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FeatureGate feature="marketplace" plan="ENTERPRISE"><OrderDetailPage id={id} /></FeatureGate>;
}

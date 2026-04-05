import type { Metadata } from 'next';
import { WorkOrderDetailPage } from '@/components/features/production/WorkOrderDetailPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'İş Emri Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FeatureGate feature="production" plan="ENTERPRISE"><WorkOrderDetailPage id={id} /></FeatureGate>;
}

import type { Metadata } from 'next';
import { BOMDetailPage } from '@/components/features/production/BOMDetailPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'BOM Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FeatureGate feature="production" plan="ENTERPRISE"><BOMDetailPage id={id} /></FeatureGate>;
}

import type { Metadata } from 'next';
import { ServiceRequestDetailPage } from '@/components/features/service/ServiceRequestDetailPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Servis Talebi Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FeatureGate feature="service"><ServiceRequestDetailPage id={id} /></FeatureGate>;
}

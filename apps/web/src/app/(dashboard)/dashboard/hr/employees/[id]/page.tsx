import type { Metadata } from 'next';
import { EmployeeDetailPage } from '@/components/features/hr/EmployeeDetailPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Personel Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FeatureGate feature="hr"><EmployeeDetailPage id={id} /></FeatureGate>;
}

import type { Metadata } from 'next';
import { PurchaseOrderDetailPage } from '@/components/features/purchase/PurchaseOrderDetailPage';
export const metadata: Metadata = { title: 'Satın Alma Siparişi — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function PurchaseOrderPage({ params }: Props) {
  const { id } = await params;
  return <PurchaseOrderDetailPage id={id} />;
}

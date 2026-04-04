import type { Metadata } from 'next';
import { SalesOrderDetailPage } from '@/components/features/sales/SalesOrderDetailPage';
export const metadata: Metadata = { title: 'Sipariş Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function SalesOrderPage({ params }: Props) {
  const { id } = await params;
  return <SalesOrderDetailPage id={id} />;
}

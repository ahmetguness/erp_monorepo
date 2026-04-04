import type { Metadata } from 'next';
import { WarehouseDetailPage } from '@/components/features/stock/WarehouseDetailPage';
export const metadata: Metadata = { title: 'Depo Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function WarehousePage({ params }: Props) {
  const { id } = await params;
  return <WarehouseDetailPage id={id} />;
}

import type { Metadata } from 'next';
import { StockCountDetailPage } from '@/components/features/stock/StockCountDetailPage';
export const metadata: Metadata = { title: 'Sayım Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function StockCountPage({ params }: Props) {
  const { id } = await params;
  return <StockCountDetailPage id={id} />;
}

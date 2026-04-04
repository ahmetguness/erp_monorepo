import type { Metadata } from 'next';
import { SalesQuoteDetailPage } from '@/components/features/sales/SalesQuoteDetailPage';
export const metadata: Metadata = { title: 'Teklif Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function QuoteDetailPage({ params }: Props) {
  const { id } = await params;
  return <SalesQuoteDetailPage id={id} />;
}

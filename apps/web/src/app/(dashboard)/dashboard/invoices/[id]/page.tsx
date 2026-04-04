import type { Metadata } from 'next';
import { InvoiceDetailPage } from '@/components/features/sales/InvoiceDetailPage';
export const metadata: Metadata = { title: 'Fatura Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function InvoicePage({ params }: Props) {
  const { id } = await params;
  return <InvoiceDetailPage id={id} />;
}

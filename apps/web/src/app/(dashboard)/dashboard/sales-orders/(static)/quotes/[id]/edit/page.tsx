import { SalesQuoteFormPage } from '@/components/features/sales/SalesQuoteFormPage';

export default async function EditSalesQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalesQuoteFormPage editId={id} />;
}

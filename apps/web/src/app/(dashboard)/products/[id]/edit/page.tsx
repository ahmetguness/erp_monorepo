import type { Metadata } from 'next';
import { ProductFormPage } from '@/components/features/products/ProductFormPage';
export const metadata: Metadata = { title: 'Ürün Düzenle — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  return <ProductFormPage editId={id} />;
}

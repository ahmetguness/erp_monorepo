import type { Metadata } from 'next';
import { ProductDetailPage } from '@/components/features/products/ProductDetailPage';
export const metadata: Metadata = { title: 'Ürün Detayı — Axon ERP' };
interface Props { params: Promise<{ id: string }> }
export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  return <ProductDetailPage id={id} />;
}

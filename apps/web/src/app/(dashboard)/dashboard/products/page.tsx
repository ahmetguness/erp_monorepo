import type { Metadata } from 'next';
import { ProductsListPage } from '@/components/features/products/ProductsListPage';
export const metadata: Metadata = { title: 'Ürünler - Axon ERP' };
export default function ProductsPage() { return <ProductsListPage />; }

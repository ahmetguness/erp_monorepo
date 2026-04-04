import type { Metadata } from 'next';
import { ProductFormPage } from '@/components/features/products/ProductFormPage';
export const metadata: Metadata = { title: 'Yeni Ürün — Axon ERP' };
export default function NewProductPage() { return <ProductFormPage />; }

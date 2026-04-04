import type { Metadata } from 'next';
import { PurchaseOrderFormPage } from '@/components/features/purchase/PurchaseOrderFormPage';
export const metadata: Metadata = { title: 'Yeni Satın Alma Siparişi — Axon ERP' };
export default function Page() { return <PurchaseOrderFormPage />; }

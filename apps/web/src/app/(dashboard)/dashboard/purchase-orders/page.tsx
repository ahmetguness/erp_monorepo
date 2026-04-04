import type { Metadata } from 'next';
import { PurchaseOrdersPage } from '@/components/features/purchase/PurchaseOrdersPage';
export const metadata: Metadata = { title: 'Satın Alma Siparişleri — Axon ERP' };
export default function Page() { return <PurchaseOrdersPage />; }

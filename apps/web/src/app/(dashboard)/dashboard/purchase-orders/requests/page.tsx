import type { Metadata } from 'next';
import { PurchaseRequestsPage } from '@/components/features/purchase/PurchaseRequestsPage';
export const metadata: Metadata = { title: 'Satın Alma Talepleri — Axon ERP' };
export default function Page() { return <PurchaseRequestsPage />; }

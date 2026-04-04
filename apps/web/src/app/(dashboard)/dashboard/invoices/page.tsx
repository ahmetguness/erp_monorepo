import type { Metadata } from 'next';
import { InvoicesListPage } from '@/components/features/sales/InvoicesListPage';
export const metadata: Metadata = { title: 'Faturalar — Axon ERP' };
export default function InvoicesPage() { return <InvoicesListPage />; }

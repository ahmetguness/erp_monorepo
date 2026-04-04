import type { Metadata } from 'next';
import { SalesQuotesListPage } from '@/components/features/sales/SalesQuotesListPage';
export const metadata: Metadata = { title: 'Teklifler — Axon ERP' };
export default function QuotesPage() { return <SalesQuotesListPage />; }

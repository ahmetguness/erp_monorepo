import type { Metadata } from 'next';
import { SalesQuoteFormPage } from '@/components/features/sales/SalesQuoteFormPage';
export const metadata: Metadata = { title: 'Yeni Teklif — Axon ERP' };
export default function NewQuotePage() { return <SalesQuoteFormPage />; }

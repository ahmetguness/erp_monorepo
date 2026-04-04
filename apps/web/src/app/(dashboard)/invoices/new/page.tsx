import type { Metadata } from 'next';
import { InvoiceFormPage } from '@/components/features/sales/InvoiceFormPage';
export const metadata: Metadata = { title: 'Yeni Fatura — Axon ERP' };
export default function NewInvoicePage() { return <InvoiceFormPage />; }

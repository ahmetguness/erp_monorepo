import type { Metadata } from 'next';
import { PaymentFormPage } from '@/components/features/accounting/PaymentFormPage';
export const metadata: Metadata = { title: 'Yeni Ödeme — Axon ERP' };
export default function NewPaymentPage() { return <PaymentFormPage />; }

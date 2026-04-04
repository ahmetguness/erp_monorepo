import type { Metadata } from 'next';
import { PaymentsListPage } from '@/components/features/accounting/PaymentsListPage';
export const metadata: Metadata = { title: 'Ödemeler — Axon ERP' };
export default function PaymentsPage() { return <PaymentsListPage />; }

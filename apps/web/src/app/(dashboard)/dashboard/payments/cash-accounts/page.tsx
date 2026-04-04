import type { Metadata } from 'next';
import { CashAccountsPage } from '@/components/features/accounting/CashAccountsPage';
export const metadata: Metadata = { title: 'Kasa Hesapları — Axon ERP' };
export default function CashPage() { return <CashAccountsPage />; }

import type { Metadata } from 'next';
import { LedgerAccountsPage } from '@/components/features/accounting/LedgerAccountsPage';
export const metadata: Metadata = { title: 'Hesap Planı — Axon ERP' };
export default function AccountsPage() { return <LedgerAccountsPage />; }

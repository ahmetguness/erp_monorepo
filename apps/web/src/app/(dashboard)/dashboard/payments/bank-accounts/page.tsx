import type { Metadata } from 'next';
import { BankAccountsPage } from '@/components/features/accounting/BankAccountsPage';
export const metadata: Metadata = { title: 'Banka Hesapları — Axon ERP' };
export default function BankPage() { return <BankAccountsPage />; }

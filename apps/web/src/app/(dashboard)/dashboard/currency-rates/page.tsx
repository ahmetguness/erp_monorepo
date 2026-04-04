import type { Metadata } from 'next';
import { CurrencyRatesPage } from '@/components/features/settings/CurrencyRatesPage';
export const metadata: Metadata = { title: 'Döviz Kurları — Axon ERP' };
export default function Page() { return <CurrencyRatesPage />; }

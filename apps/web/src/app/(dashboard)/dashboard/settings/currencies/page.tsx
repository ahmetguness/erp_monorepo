import type { Metadata } from 'next';
import { CurrenciesManager } from '@/components/features/settings/CurrenciesManager';

export const metadata: Metadata = { title: 'Para Birimleri — Axon ERP' };

export default function CurrenciesPage() {
  return <CurrenciesManager />;
}

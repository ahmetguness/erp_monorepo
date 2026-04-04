import type { Metadata } from 'next';
import { TaxRatesManager } from '@/components/features/settings/TaxRatesManager';

export const metadata: Metadata = { title: 'KDV Oranları — Axon ERP' };

export default function TaxRatesPage() {
  return <TaxRatesManager />;
}

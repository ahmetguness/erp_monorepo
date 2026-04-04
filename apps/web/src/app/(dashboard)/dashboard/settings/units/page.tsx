import type { Metadata } from 'next';
import { UnitsManager } from '@/components/features/settings/UnitsManager';

export const metadata: Metadata = { title: 'Birimler — Axon ERP' };

export default function UnitsPage() {
  return <UnitsManager />;
}

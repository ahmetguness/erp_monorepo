import type { Metadata } from 'next';
import { FiscalPeriodsPage } from '@/components/features/accounting/FiscalPeriodsPage';
export const metadata: Metadata = { title: 'Mali Dönemler — Axon ERP' };
export default function FiscalPage() { return <FiscalPeriodsPage />; }

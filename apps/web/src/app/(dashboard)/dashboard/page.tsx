import type { Metadata } from 'next';
import { DashboardOverview } from '@/components/features/dashboard/DashboardOverview';

export const metadata: Metadata = { title: 'Dashboard — Axon ERP' };

export default function DashboardPage() {
  return <DashboardOverview />;
}

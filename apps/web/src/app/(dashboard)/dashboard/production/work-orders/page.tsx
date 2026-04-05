import type { Metadata } from 'next';
import { WorkOrdersPage } from '@/components/features/production/WorkOrdersPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'İş Emirleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="production" plan="ENTERPRISE"><WorkOrdersPage /></FeatureGate>; }

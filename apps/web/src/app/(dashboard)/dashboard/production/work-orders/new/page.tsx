import type { Metadata } from 'next';
import { WorkOrderFormPage } from '@/components/features/production/WorkOrderFormPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Yeni İş Emri — Axon ERP' };
export default function Page() { return <FeatureGate feature="production" plan="ENTERPRISE"><WorkOrderFormPage /></FeatureGate>; }

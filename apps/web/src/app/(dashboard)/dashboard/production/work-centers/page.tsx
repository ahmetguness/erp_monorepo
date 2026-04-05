import type { Metadata } from 'next';
import { WorkCentersPage } from '@/components/features/production/WorkCentersPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'İş Merkezleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="production" plan="ENTERPRISE"><WorkCentersPage /></FeatureGate>; }

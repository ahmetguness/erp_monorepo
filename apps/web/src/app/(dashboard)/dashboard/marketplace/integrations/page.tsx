import type { Metadata } from 'next';
import { IntegrationsPage } from '@/components/features/marketplace/IntegrationsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Pazaryeri Entegrasyonları — Axon ERP' };
export default function Page() { return <FeatureGate feature="marketplace" plan="ENTERPRISE"><IntegrationsPage /></FeatureGate>; }

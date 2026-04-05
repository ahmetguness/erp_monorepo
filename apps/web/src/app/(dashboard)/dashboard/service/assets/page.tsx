import type { Metadata } from 'next';
import { CustomerAssetsPage } from '@/components/features/service/CustomerAssetsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Müşteri Varlıkları — Axon ERP' };
export default function Page() { return <FeatureGate feature="service"><CustomerAssetsPage /></FeatureGate>; }

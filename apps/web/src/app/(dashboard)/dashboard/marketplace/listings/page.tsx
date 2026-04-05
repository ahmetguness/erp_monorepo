import type { Metadata } from 'next';
import { ListingsPage } from '@/components/features/marketplace/ListingsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Ürün Listelemeleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="marketplace" plan="ENTERPRISE"><ListingsPage /></FeatureGate>; }

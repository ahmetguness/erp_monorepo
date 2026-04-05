import type { Metadata } from 'next';
import { BOMsPage } from '@/components/features/production/BOMsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Ürün Ağaçları (BOM) — Axon ERP' };
export default function Page() { return <FeatureGate feature="production" plan="ENTERPRISE"><BOMsPage /></FeatureGate>; }

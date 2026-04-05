import type { Metadata } from 'next';
import { PurchaseOrdersPage } from '@/components/features/purchase/PurchaseOrdersPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Satın Alma Siparişleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="purchasing" plan="PROFESSIONAL"><PurchaseOrdersPage /></FeatureGate>; }

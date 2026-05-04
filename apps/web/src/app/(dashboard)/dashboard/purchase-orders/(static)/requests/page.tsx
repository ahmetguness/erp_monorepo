import type { Metadata } from 'next';
import { PurchaseRequestsPage } from '@/components/features/purchase/PurchaseRequestsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Satın Alma Talepleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="purchasing" plan="PROFESSIONAL"><PurchaseRequestsPage /></FeatureGate>; }

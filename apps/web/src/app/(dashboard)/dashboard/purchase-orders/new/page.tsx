import type { Metadata } from 'next';
import { PurchaseOrderFormPage } from '@/components/features/purchase/PurchaseOrderFormPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Yeni Satın Alma Siparişi — Axon ERP' };
export default function Page() { return <FeatureGate feature="purchasing" plan="PROFESSIONAL"><PurchaseOrderFormPage /></FeatureGate>; }

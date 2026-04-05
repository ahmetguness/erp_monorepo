import type { Metadata } from 'next';
import { MarketplaceOrdersPage } from '@/components/features/marketplace/OrdersPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Pazaryeri Siparişleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="marketplace" plan="ENTERPRISE"><MarketplaceOrdersPage /></FeatureGate>; }

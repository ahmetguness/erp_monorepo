import type { Metadata } from 'next';
import { ServiceRequestsPage } from '@/components/features/service/ServiceRequestsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Servis Talepleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="service"><ServiceRequestsPage /></FeatureGate>; }

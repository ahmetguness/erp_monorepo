import type { Metadata } from 'next';
import { LeaveRequestsPage } from '@/components/features/hr/LeaveRequestsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'İzin Talepleri — Axon ERP' };
export default function Page() { return <FeatureGate feature="hr"><LeaveRequestsPage /></FeatureGate>; }

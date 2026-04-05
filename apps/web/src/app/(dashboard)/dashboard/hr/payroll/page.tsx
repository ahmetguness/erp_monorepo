import type { Metadata } from 'next';
import { PayrollPage } from '@/components/features/hr/PayrollPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Bordro — Axon ERP' };
export default function Page() { return <FeatureGate feature="payroll" plan="ENTERPRISE"><PayrollPage /></FeatureGate>; }

import type { Metadata } from 'next';
import { AttendancePage } from '@/components/features/hr/AttendancePage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Puantaj — Axon ERP' };
export default function Page() { return <FeatureGate feature="hr"><AttendancePage /></FeatureGate>; }

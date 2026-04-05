import type { Metadata } from 'next';
import { EmployeesPage } from '@/components/features/hr/EmployeesPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export const metadata: Metadata = { title: 'Personel — Axon ERP' };
export default function Page() { return <FeatureGate feature="hr"><EmployeesPage /></FeatureGate>; }

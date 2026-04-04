import type { Metadata } from 'next';
import { AuditLogPage } from '@/components/features/settings/AuditLogPage';
export const metadata: Metadata = { title: 'Denetim Kaydı — Axon ERP' };
export default function Page() { return <AuditLogPage />; }

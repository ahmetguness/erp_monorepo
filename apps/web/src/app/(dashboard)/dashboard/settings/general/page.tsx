import type { Metadata } from 'next';
import { SettingsPage } from '@/components/features/settings/SettingsPage';
export const metadata: Metadata = { title: 'Genel Ayarlar — Axon ERP' };
export default function Page() { return <SettingsPage />; }

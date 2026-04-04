import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ayarlar — Axon ERP' };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

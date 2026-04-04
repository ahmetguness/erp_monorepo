import type { Metadata } from 'next';
import { ContactFormPage } from '@/components/features/contacts/ContactFormPage';

export const metadata: Metadata = { title: 'Yeni Cari Hesap — Axon ERP' };

export default function NewContactPage() {
  return <ContactFormPage />;
}

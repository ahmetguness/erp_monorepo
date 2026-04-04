import type { Metadata } from 'next';
import { ContactsListPage } from '@/components/features/contacts/ContactsListPage';

export const metadata: Metadata = { title: 'Cari Hesaplar — Axon ERP' };

export default function ContactsPage() {
  return <ContactsListPage />;
}

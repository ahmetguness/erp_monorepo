import type { Metadata } from 'next';
import { ContactDetailPage } from '@/components/features/contacts/ContactDetailPage';

export const metadata: Metadata = { title: 'Cari Hesap Detayı — Axon ERP' };

interface Props { params: Promise<{ id: string }> }

export default async function ContactPage({ params }: Props) {
  const { id } = await params;
  return <ContactDetailPage id={id} />;
}

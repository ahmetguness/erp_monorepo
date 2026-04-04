import type { Metadata } from 'next';
import { ContactFormPage } from '@/components/features/contacts/ContactFormPage';

export const metadata: Metadata = { title: 'Cari Hesap Düzenle — Axon ERP' };

interface Props { params: Promise<{ id: string }> }

export default async function EditContactPage({ params }: Props) {
  const { id } = await params;
  return <ContactFormPage editId={id} />;
}

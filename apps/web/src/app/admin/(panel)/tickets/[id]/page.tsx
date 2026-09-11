'use client';

import { useParams } from 'next/navigation';
import { AdminTicketDetailPage } from '@/components/features/admin/support-tickets';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <AdminTicketDetailPage ticketId={params.id} />;
}

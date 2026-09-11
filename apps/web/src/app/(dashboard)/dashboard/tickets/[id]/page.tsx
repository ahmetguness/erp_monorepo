'use client';

import { useParams } from 'next/navigation';
import { TicketDetailPage } from '@/components/features/support-tickets';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <TicketDetailPage ticketId={params.id} />;
}

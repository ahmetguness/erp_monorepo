import { apiClient } from '@/lib/api-client';

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  roleId: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  invitedBy: string;
  acceptedAt: string | null;
  createdAt: string;
}

export async function getInvitations(): Promise<Invitation[]> {
  const res = await apiClient.get('/api/invitations');
  return res.data.data;
}

export async function createInvitation(email: string, roleId?: string) {
  const res = await apiClient.post('/api/invitations', { email, roleId });
  return res.data;
}

export async function cancelInvitation(id: string) {
  const res = await apiClient.post(`/api/invitations/${id}/cancel`);
  return res.data;
}

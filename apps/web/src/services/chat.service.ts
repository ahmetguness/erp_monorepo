import { apiClient } from '@/lib/api-client';

export interface ChatResponse {
  output: string;
  usedTools: boolean;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/chat/history');
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/chat', { message });
  return res.data;
}

export async function openChatStream(message: string, signal?: AbortSignal): Promise<Response> {
  const token = getCookie('axon_token');
  if (!token) throw new Error('Oturum bilgisi bulunamadı.');

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
    signal,
  });
}

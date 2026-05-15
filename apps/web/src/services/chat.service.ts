import { apiClient } from '@/lib/api-client';

export interface ChatResponse {
  output: string;
  usedTools: boolean;
}

export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/chat/history');
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/chat', { message });
  return res.data;
}

export async function openChatStream(message: string, signal?: AbortSignal): Promise<Response> {

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
    signal,
  });
}

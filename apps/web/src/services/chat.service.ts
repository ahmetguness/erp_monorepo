import { apiClient } from '@/lib/api-client';

export interface ChatResponse {
  output: string;
  usedTools: boolean;
}

export type ChatEntityType =
  | 'contact'
  | 'invoice'
  | 'sales_quote'
  | 'sales_order'
  | 'employee'
  | 'product';

export interface ChatRecentRecord {
  entityType: ChatEntityType;
  entityId: string;
  label: string;
  path: string;
  viewedAt: string;
}

export interface ChatPageContext {
  path: string;
  title?: string;
  entityType?: ChatEntityType;
  entityId?: string;
  entityLabel?: string;
  recentRecords: ChatRecentRecord[];
}

export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/chat/history');
}

export async function sendChatMessage(message: string, context?: ChatPageContext): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/chat', { message, context });
  return res.data;
}

export async function openChatStream(message: string, context?: ChatPageContext, signal?: AbortSignal): Promise<Response> {

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, context }),
    signal,
  });
}

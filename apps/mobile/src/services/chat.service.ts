import { apiClient } from '../lib/api-client';
import { API_URL } from '../lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ChatResponse {
  output: string;
  usedTools: boolean;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * Sends a chat message and returns the full response (non-streaming).
 * React Native does not natively support ReadableStream/SSE,
 * so we use the standard POST endpoint instead of /stream.
 */
export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/chat', { message });
  return res.data;
}

/**
 * Clears the server-side conversation history.
 */
export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/chat/history');
}

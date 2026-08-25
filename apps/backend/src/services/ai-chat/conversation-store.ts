import { openai } from '../../lib/openai';
import { ChatDataService } from '../chat-data.service';
import { ChatContextService, type ChatPageContext, type LoadedChatEntityContext } from '../chat-context.service';
import { logger } from '../../lib/logger';
import { AI_MODELS, AI_PROMPT_VERSIONS, type AiTokenUsage } from '../ai-governance.service';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';

// ─────────────────────────────────────────────

interface ConversationEntry {
  messages: ChatCompletionMessageParam[];
  lastAccess: number;
}

const conversations = new Map<string, ConversationEntry>();
const MAX_HISTORY = 25;
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 dakika
const MAX_CONVERSATIONS = 10_000; // Bellek koruması

/** Eski konuşmaları temizle */
function cleanupConversations() {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now - entry.lastAccess > CONVERSATION_TTL) {
      conversations.delete(key);
    }
  }
}

// Her 5 dakikada temizlik
setInterval(cleanupConversations, 5 * 60 * 1000);

export function getConversation(sessionId: string): ChatCompletionMessageParam[] {
  const entry = conversations.get(sessionId);
  if (entry) {
    entry.lastAccess = Date.now();
    return entry.messages;
  }
  return [];
}

export function addToConversation(
  sessionId: string,
  messages: ChatCompletionMessageParam[],
) {
  const entry = conversations.get(sessionId);
  if (entry) {
    entry.messages.push(...messages);
    // Geçmişi sınırla (system prompt hariç)
    if (entry.messages.length > MAX_HISTORY * 2) {
      entry.messages = entry.messages.slice(-MAX_HISTORY * 2);
    }
    entry.lastAccess = Date.now();
  } else {
    // Yeni konuşma eklerken boyut kontrolü
    if (conversations.size >= MAX_CONVERSATIONS) {
      // En eski konuşmayı sil
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of conversations) {
        if (entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = key;
        }
      }
      if (oldestKey) conversations.delete(oldestKey);
    }
    conversations.set(sessionId, { messages: [...messages], lastAccess: Date.now() });
  }
}

export function clearConversation(sessionId: string) {
  conversations.delete(sessionId);
}

// ─────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────

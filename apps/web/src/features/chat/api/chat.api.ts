import type { ChatConversation, ChatMessage } from "@repo/types/chat";
import {
  ChatConversationSchema,
  ChatCursorPageSchema,
  ChatMessageSchema,
} from "@repo/types/chat";
import { z } from "zod";
import axios from "axios";
import { apiClient } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/constants";
import { safeParse } from "@/lib/safe-parse";

const ConversationPageSchema = z.object({
  items: z.array(ChatConversationSchema),
  nextCursor: z.string().nullable(),
});
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export async function listConversations(
  cursor?: string,
): Promise<CursorPage<ChatConversation>> {
  const response = await apiClient.get("/api/chat/conversations", {
    params: { cursor, limit: 50 },
  });
  return safeParse(
    ConversationPageSchema,
    response.data.data,
    "listChatConversations",
  );
}

export async function listMessages(
  conversationId: string,
  cursor?: string,
): Promise<CursorPage<ChatMessage>> {
  const response = await apiClient.get(
    `/api/chat/conversations/${conversationId}/messages`,
    { params: { cursor, limit: 50 } },
  );
  return safeParse(
    ChatCursorPageSchema,
    response.data.data,
    "listChatMessages",
  );
}

export async function createDirectConversation(
  userId: string,
): Promise<ChatConversation> {
  const response = await apiClient.post("/api/chat/conversations/direct", {
    userId,
  });
  return safeParse(
    ChatConversationSchema,
    response.data.data,
    "createDirectConversation",
  );
}

export async function createGroupConversation(input: {
  title: string;
  description?: string;
  memberIds: string[];
}): Promise<ChatConversation> {
  const response = await apiClient.post("/api/chat/conversations/groups", {
    ...input,
    historyVisibility: "FROM_JOIN",
  });
  return safeParse(
    ChatConversationSchema,
    response.data.data,
    "createGroupConversation",
  );
}

export async function sendMessage(
  conversationId: string,
  input: {
    clientMessageId: string;
    content: string | null;
    replyToMessageId?: string;
    attachmentIds: string[];
    mentionUserIds: string[];
  },
): Promise<ChatMessage> {
  const response = await apiClient.post(
    `/api/chat/conversations/${conversationId}/messages`,
    { ...input, type: input.attachmentIds.length > 0 ? "FILE" : "TEXT" },
  );
  return safeParse(ChatMessageSchema, response.data.data, "sendChatMessage");
}

export async function editMessage(
  messageId: string,
  content: string,
  expectedUpdatedAt: string,
): Promise<ChatMessage> {
  const response = await apiClient.patch(`/api/chat/messages/${messageId}`, {
    content,
    expectedUpdatedAt,
  });
  return safeParse(ChatMessageSchema, response.data.data, "editChatMessage");
}

export async function deleteMessage(messageId: string): Promise<ChatMessage> {
  const response = await apiClient.delete(`/api/chat/messages/${messageId}`);
  return safeParse(ChatMessageSchema, response.data.data, "deleteChatMessage");
}

export async function forwardMessage(messageId: string, conversationIds: string[]): Promise<ChatMessage[]> {
  const response = await apiClient.post(`/api/chat/messages/${messageId}/forward`, { conversationIds });
  return z.array(ChatMessageSchema).parse(response.data.data);
}

export async function setMessageReaction(messageId: string, emoji: string, reacted: boolean): Promise<void> {
  await apiClient.request({ method: reacted ? "PUT" : "DELETE", url: `/api/chat/messages/${messageId}/reactions`, data: { emoji } });
}

export async function createPoll(conversationId: string, input: { question: string; options: string[]; multiple: boolean; anonymous: boolean }): Promise<ChatMessage> {
  const response = await apiClient.post(`/api/chat/conversations/${conversationId}/polls`, input);
  return ChatMessageSchema.parse(response.data.data);
}

export async function votePoll(pollId: string, optionIds: string[]): Promise<void> {
  await apiClient.post(`/api/chat/polls/${pollId}/votes`, { optionIds });
}

export async function createEvent(conversationId: string, input: { title: string; startsAt: string; endsAt: string; timezone: string }): Promise<ChatMessage> {
  const response = await apiClient.post(`/api/chat/conversations/${conversationId}/events`, input);
  return ChatMessageSchema.parse(response.data.data);
}

export async function respondEvent(eventId: string, status: "GOING" | "MAYBE" | "DECLINED"): Promise<void> {
  await apiClient.put(`/api/chat/events/${eventId}/response`, { status });
}

export async function markConversationRead(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await apiClient.post(`/api/chat/conversations/${conversationId}/read`, {
    messageId,
  });
}

export async function setMessageStar(
  messageId: string,
  starred: boolean,
): Promise<void> {
  await apiClient.request({
    method: starred ? "PUT" : "DELETE",
    url: `/api/chat/messages/${messageId}/star`,
  });
}

export async function setMessagePin(
  messageId: string,
  pinned: boolean,
): Promise<void> {
  await apiClient.request({
    method: pinned ? "PUT" : "DELETE",
    url: `/api/chat/messages/${messageId}/pin`,
  });
}

export async function clearConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/api/chat/conversations/${conversationId}/clear`);
}

export async function setConversationPinned(
  conversationId: string,
  pinned: boolean,
): Promise<void> {
  await apiClient.put(`/api/chat/conversations/${conversationId}/pin`, {
    pinned,
  });
}

export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
): Promise<void> {
  await apiClient.put(`/api/chat/conversations/${conversationId}/mute`, {
    mutedUntil: muted ? "9999-12-31T23:59:59.000Z" : null,
    notificationLevel: muted ? "NONE" : "ALL",
  });
}

export async function uploadChatAttachment(
  file: File,
  onProgress: (percent: number) => void,
) {
  const ticketResponse = await apiClient.post("/api/chat/uploads/reservations", {
    originalName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  const ticket = z.object({
    reservationId: z.string(),
    attachmentId: z.string(),
    expiresAt: z.string().datetime(),
    upload: z.object({
      method: z.literal("PUT"),
      url: z.string(),
      headers: z.record(z.string(), z.string()),
      direct: z.boolean(),
    }),
  }).parse(ticketResponse.data.data);
  const targetUrl = ticket.upload.direct ? ticket.upload.url : `${API_BASE_URL}${ticket.upload.url}`;
  await axios.put(targetUrl, file, {
    headers: ticket.upload.headers,
    withCredentials: !ticket.upload.direct,
    onUploadProgress: (event) =>
      onProgress(
        event.total ? Math.round((event.loaded / event.total) * 100) : 0,
      ),
  });
  if (ticket.upload.direct) await apiClient.post(`/api/chat/uploads/${ticket.reservationId}/complete`);
  const statusSchema = z.object({
    reservationStatus: z.enum(["RESERVED", "UPLOADED", "SCANNING", "COMMITTED", "REJECTED", "EXPIRED", "CANCELLED"]),
    failureReason: z.string().nullable(),
    attachment: z.object({
      id: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      kind: z.enum(["IMAGE", "DOCUMENT", "OTHER"]),
      status: z.enum(["PENDING_UPLOAD", "UPLOADED", "SCANNING", "READY", "REJECTED", "EXPIRED", "DELETED"]),
    }).nullable(),
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await apiClient.get(`/api/chat/uploads/${ticket.reservationId}/status`);
    const current = statusSchema.parse(response.data.data);
    if (current.reservationStatus === "COMMITTED" && current.attachment?.status === "READY") return { ...current.attachment, status: "READY" as const };
    if (["REJECTED", "EXPIRED", "CANCELLED"].includes(current.reservationStatus)) throw new Error(current.failureReason ?? "Dosya yüklemesi tamamlanamadı.");
    await new Promise((resolve) => window.setTimeout(resolve, 750));
  }
  throw new Error("Dosya güvenlik taraması zaman aşımına uğradı.");
}

export async function searchMessages(
  query: string,
  conversationId?: string,
): Promise<CursorPage<ChatMessage>> {
  const response = await apiClient.get("/api/chat/search", {
    params: { q: query, conversationId, limit: 50 },
  });
  return safeParse(
    ChatCursorPageSchema,
    response.data.data,
    "searchChatMessages",
  );
}

import type { ChatConversation, ChatMessage } from "@repo/types/chat";
import type {
  ChatConversationType,
  ChatEventResponseStatus,
  ChatHistoryVisibility,
  ChatMemberRole,
  ChatMessageType,
  ChatNotificationLevel,
} from "@prisma/client";

export interface ChatContext {
  tenantId: string;
  userId: string;
}
export interface ChatPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface CreateGroupInput {
  title: string;
  description?: string | null;
  memberIds: string[];
  historyVisibility: ChatHistoryVisibility;
}
export interface SendMessageInput {
  clientMessageId: string;
  content: string | null;
  type: ChatMessageType;
  replyToMessageId?: string | null;
  attachmentIds: string[];
  mentionUserIds: string[];
  forwardedFromMessageId?: string;
  forwardedSnapshot?: { senderName: string; content: string | null; createdAt: string };
}
export interface ConversationPreferencesInput {
  pinned?: boolean;
  mutedUntil?: Date | null;
  notificationLevel?: ChatNotificationLevel;
  archived?: boolean;
}
export interface SearchInput {
  q: string;
  conversationId?: string;
  from?: Date;
  to?: Date;
  senderId?: string;
  hasAttachment?: boolean;
  cursor?: string;
  limit: number;
}
export interface PollInput {
  question: string;
  options: string[];
  multiple: boolean;
  anonymous: boolean;
  closesAt?: Date | null;
}
export interface EventInput {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location?: string | null;
  onlineUrl?: string | null;
}
export interface ConversationCreateRecord {
  type: ChatConversationType;
  title?: string;
  description?: string | null;
  directKey?: string;
  memberIds: string[];
  historyVisibility?: ChatHistoryVisibility;
}

export interface ChatRepository {
  listConversations(
    context: ChatContext,
    cursor: string | undefined,
    limit: number,
  ): Promise<ChatPage<ChatConversation>>;
  createConversation(
    context: ChatContext,
    input: ConversationCreateRecord,
  ): Promise<ChatConversation>;
  findDirect(
    context: ChatContext,
    directKey: string,
  ): Promise<ChatConversation | null>;
  getConversation(
    context: ChatContext,
    conversationId: string,
  ): Promise<ChatConversation>;
  updateConversation(
    context: ChatContext,
    conversationId: string,
    input: { title?: string; description?: string | null },
  ): Promise<ChatConversation>;
  listMessages(
    context: ChatContext,
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ChatPage<ChatMessage>>;
  sendMessage(
    context: ChatContext,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<ChatMessage>;
  editMessage(
    context: ChatContext,
    messageId: string,
    content: string,
    expectedUpdatedAt?: Date,
  ): Promise<ChatMessage>;
  deleteMessage(context: ChatContext, messageId: string): Promise<ChatMessage>;
  forwardMessage(
    context: ChatContext,
    messageId: string,
    conversationIds: string[],
  ): Promise<ChatMessage[]>;
  markRead(
    context: ChatContext,
    conversationId: string,
    messageId: string,
  ): Promise<void>;
  updatePreferences(
    context: ChatContext,
    conversationId: string,
    input: ConversationPreferencesInput,
  ): Promise<void>;
  clearConversation(
    context: ChatContext,
    conversationId: string,
  ): Promise<void>;
  setStar(
    context: ChatContext,
    messageId: string,
    starred: boolean,
  ): Promise<void>;
  setMessagePin(
    context: ChatContext,
    messageId: string,
    pinned: boolean,
  ): Promise<void>;
  setReaction(
    context: ChatContext,
    messageId: string,
    emoji: string,
    reacted: boolean,
  ): Promise<void>;
  search(
    context: ChatContext,
    input: SearchInput,
  ): Promise<ChatPage<ChatMessage>>;
  addMembers(
    context: ChatContext,
    conversationId: string,
    userIds: string[],
    maxMembers: number,
  ): Promise<void>;
  removeMember(
    context: ChatContext,
    conversationId: string,
    userId: string,
  ): Promise<void>;
  updateMemberRole(
    context: ChatContext,
    conversationId: string,
    userId: string,
    role: ChatMemberRole,
  ): Promise<void>;
  createInvite(
    context: ChatContext,
    conversationId: string,
    inviteeId: string,
    expiresAt: Date,
  ): Promise<{ id: string }>;
  respondInvite(
    context: ChatContext,
    inviteId: string,
    accept: boolean,
    maxMembers: number,
  ): Promise<void>;
  createPoll(
    context: ChatContext,
    conversationId: string,
    input: PollInput,
  ): Promise<ChatMessage>;
  votePoll(
    context: ChatContext,
    pollId: string,
    optionIds: string[],
  ): Promise<void>;
  closePoll(context: ChatContext, pollId: string): Promise<void>;
  createEvent(
    context: ChatContext,
    conversationId: string,
    input: EventInput,
  ): Promise<ChatMessage>;
  respondEvent(
    context: ChatContext,
    eventId: string,
    status: ChatEventResponseStatus,
  ): Promise<void>;
}

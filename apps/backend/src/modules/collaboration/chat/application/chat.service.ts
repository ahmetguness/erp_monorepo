import type { ChatMemberRole } from "@prisma/client";
import { ConflictError, ValidationError } from "../../../../errors/index.js";
import { CHAT_LIMITS, assertMessageContent } from "../domain/chat-policy.js";
import type {
  ChatContext,
  ChatRepository,
  CreateGroupInput,
  EventInput,
  PollInput,
  SearchInput,
  SendMessageInput,
} from "./chat.types.js";
import type { StoragePlanResolver } from "../../../storage-accounting/index.js";

function directKey(first: string, second: string): string {
  return [first, second].sort().join(":");
}

export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly planResolver: StoragePlanResolver,
  ) {}

  getUnreadCount(context: ChatContext) {
    return this.repository.getUnreadCount(context);
  }

  listConversations(context: ChatContext, cursor?: string, limit = 30) {
    return this.repository.listConversations(
      context,
      cursor,
      Math.min(100, Math.max(1, limit)),
    );
  }

  async createDirect(context: ChatContext, otherUserId: string) {
    if (otherUserId === context.userId)
      throw new ValidationError("Kendinizle sohbet oluşturamazsınız.");
    const key = directKey(context.userId, otherUserId);
    const existing = await this.repository.findDirect(context, key);
    if (existing) return existing;
    try {
      return await this.repository.createConversation(context, {
        type: "DIRECT",
        directKey: key,
        memberIds: [otherUserId],
      });
    } catch (error: unknown) {
      const raced = await this.repository.findDirect(context, key);
      if (raced) return raced;
      throw error;
    }
  }

  async createGroup(context: ChatContext, input: CreateGroupInput) {
    const memberIds = [
      ...new Set(input.memberIds.filter((id) => id !== context.userId)),
    ];
    const limits = await this.planResolver.resolve(context.tenantId);
    if (memberIds.length + 1 > limits.chatMaxGroupMembers)
      throw new ValidationError("Grup üye limiti aşıldı.");
    return this.repository.createConversation(context, {
      ...input,
      type: "GROUP",
      memberIds,
    });
  }

  getConversation(context: ChatContext, conversationId: string) {
    return this.repository.getConversation(context, conversationId);
  }
  updateConversation(
    context: ChatContext,
    conversationId: string,
    input: { title?: string; description?: string | null },
  ) {
    return this.repository.updateConversation(context, conversationId, input);
  }
  listMessages(
    context: ChatContext,
    conversationId: string,
    cursor?: string,
    limit = 50,
  ) {
    return this.repository.listMessages(
      context,
      conversationId,
      cursor,
      Math.min(100, Math.max(1, limit)),
    );
  }

  async sendMessage(
    context: ChatContext,
    conversationId: string,
    input: SendMessageInput,
  ) {
    const limits = await this.planResolver.resolve(context.tenantId);
    assertMessageContent(input.content, input.attachmentIds.length);
    if (input.attachmentIds.length > limits.chatAttachmentsPerMessage)
      throw new ValidationError(`Planınızda mesaj başına en fazla ${limits.chatAttachmentsPerMessage} dosya gönderilebilir.`);
    return this.repository.sendMessage(context, conversationId, {
      ...input,
      mentionUserIds: [...new Set(input.mentionUserIds)],
    });
  }

  editMessage(
    context: ChatContext,
    messageId: string,
    content: string,
    expectedUpdatedAt?: Date,
  ) {
    return this.repository.editMessage(
      context,
      messageId,
      content,
      expectedUpdatedAt,
    );
  }
  deleteMessage(context: ChatContext, messageId: string) {
    return this.repository.deleteMessage(context, messageId);
  }
  forwardMessage(
    context: ChatContext,
    messageId: string,
    conversationIds: string[],
  ) {
    return this.repository.forwardMessage(context, messageId, [
      ...new Set(conversationIds),
    ]);
  }
  markRead(context: ChatContext, conversationId: string, messageId: string) {
    return this.repository.markRead(context, conversationId, messageId);
  }
  pinConversation(
    context: ChatContext,
    conversationId: string,
    pinned: boolean,
  ) {
    return this.repository.updatePreferences(context, conversationId, {
      pinned,
    });
  }
  muteConversation(
    context: ChatContext,
    conversationId: string,
    mutedUntil: Date | null,
    notificationLevel?: "ALL" | "MENTIONS" | "NONE",
  ) {
    return this.repository.updatePreferences(context, conversationId, {
      mutedUntil,
      notificationLevel,
    });
  }
  archiveConversation(
    context: ChatContext,
    conversationId: string,
    archived: boolean,
  ) {
    return this.repository.updatePreferences(context, conversationId, {
      archived,
    });
  }
  clearConversation(context: ChatContext, conversationId: string) {
    return this.repository.clearConversation(context, conversationId);
  }
  setStar(context: ChatContext, messageId: string, starred: boolean) {
    return this.repository.setStar(context, messageId, starred);
  }
  setMessagePin(context: ChatContext, messageId: string, pinned: boolean) {
    return this.repository.setMessagePin(context, messageId, pinned);
  }
  setReaction(
    context: ChatContext,
    messageId: string,
    emoji: string,
    reacted: boolean,
  ) {
    return this.repository.setReaction(context, messageId, emoji, reacted);
  }
  search(context: ChatContext, input: SearchInput) {
    if (input.q.trim().length < 2)
      throw new ValidationError("Arama en az 2 karakter olmalıdır.");
    return this.repository.search(context, {
      ...input,
      q: input.q.trim(),
      limit: Math.min(100, Math.max(1, input.limit)),
    });
  }
  async addMembers(context: ChatContext, conversationId: string, userIds: string[]) {
    const limits = await this.planResolver.resolve(context.tenantId);
    return this.repository.addMembers(context, conversationId, [
      ...new Set(userIds),
    ], limits.chatMaxGroupMembers);
  }
  removeMember(context: ChatContext, conversationId: string, userId: string) {
    return this.repository.removeMember(context, conversationId, userId);
  }
  updateMemberRole(
    context: ChatContext,
    conversationId: string,
    userId: string,
    role: ChatMemberRole,
  ) {
    return this.repository.updateMemberRole(
      context,
      conversationId,
      userId,
      role,
    );
  }
  createInvite(
    context: ChatContext,
    conversationId: string,
    inviteeId: string,
    expiresAt?: Date,
  ) {
    return this.repository.createInvite(
      context,
      conversationId,
      inviteeId,
      expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
    );
  }
  async respondInvite(context: ChatContext, inviteId: string, accept: boolean) {
    const limits = await this.planResolver.resolve(context.tenantId);
    return this.repository.respondInvite(context, inviteId, accept, limits.chatMaxGroupMembers);
  }
  createPoll(context: ChatContext, conversationId: string, input: PollInput) {
    return this.repository.createPoll(context, conversationId, input);
  }
  votePoll(context: ChatContext, pollId: string, optionIds: string[]) {
    if (new Set(optionIds).size !== optionIds.length)
      throw new ConflictError("Aynı seçenek birden fazla gönderilemez.");
    return this.repository.votePoll(context, pollId, optionIds);
  }
  closePoll(context: ChatContext, pollId: string) {
    return this.repository.closePoll(context, pollId);
  }
  createEvent(context: ChatContext, conversationId: string, input: EventInput) {
    return this.repository.createEvent(context, conversationId, input);
  }
  respondEvent(
    context: ChatContext,
    eventId: string,
    status: "GOING" | "MAYBE" | "DECLINED",
  ) {
    return this.repository.respondEvent(context, eventId, status);
  }
}

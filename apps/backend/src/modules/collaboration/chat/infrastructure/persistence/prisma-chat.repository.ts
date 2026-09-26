import type { ChatConversation, ChatMessage } from "@repo/types/chat";
import {
  ChatConversationType,
  ChatMemberRole,
  ChatMessageType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../../../errors/index.js";
import {
  assertGroupManager,
  assertMessageMutation,
  CHAT_LIMITS,
} from "../../domain/chat-policy.js";
import type {
  ChatContext,
  ChatPage,
  ChatRepository,
  ConversationCreateRecord,
  ConversationPreferencesInput,
  EventInput,
  PollInput,
  SearchInput,
  SendMessageInput,
} from "../../application/chat.types.js";

const messageInclude = {
  sender: { select: { id: true, name: true, email: true } },
  replyTo: {
    select: { id: true, content: true, sender: { select: { name: true } } },
  },
  mentions: { select: { mentionedUserId: true } },
  attachments: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      kind: true,
      status: true,
    },
  },
  stars: { select: { userId: true } },
  pinnedIn: { select: { messageId: true } },
  reactions: { select: { emoji: true, userId: true } },
  poll: {
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
        include: {
          votes: {
            select: {
              userId: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  event: { include: { responses: { select: { userId: true, status: true } } } },
} as const satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{
  include: typeof messageInclude;
}>;

const conversationInclude = {
  members: {
    where: { leftAt: null },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  messages: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    include: messageInclude,
  },
} as const satisfies Prisma.ChatConversationInclude;

type ConversationRow = Prisma.ChatConversationGetPayload<{
  include: typeof conversationInclude;
}>;
type Transaction = Prisma.TransactionClient;

function forwardedContent(source: MessageRow): string {
  const content = source.content?.trim();
  if (source.poll) {
    return `Anket: ${source.poll.question}\n${source.poll.options.map((option) => `• ${option.label}`).join('\n')}`;
  }
  if (source.event) {
    return `Etkinlik: ${source.event.title}\n${source.event.startsAt.toLocaleString('tr-TR')}`;
  }
  if (source.attachments.length > 0) {
    const files = `Dosya: ${source.attachments.map((attachment) => attachment.originalName).join(', ')}`;
    return content ? `${content}\n${files}` : files;
  }
  if (content) return content;
  return 'İletilen mesaj';
}

function messageView(row: MessageRow, viewerId: string): ChatMessage {
  const reactionMap = new Map<
    string,
    { count: number; reactedByMe: boolean }
  >();
  for (const reaction of row.reactions) {
    const current = reactionMap.get(reaction.emoji) ?? {
      count: 0,
      reactedByMe: false,
    };
    current.count += 1;
    current.reactedByMe ||= reaction.userId === viewerId;
    reactionMap.set(reaction.emoji, current);
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    clientMessageId: row.clientMessageId,
    type: row.type,
    content: row.deletedAt ? null : row.content,
    sender: row.sender,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          content: row.replyTo.content,
          senderName: row.replyTo.sender.name,
        }
      : null,
    forwarded: row.forwardedFromMessageId !== null,
    mentionUserIds: row.mentions.map((mention) => mention.mentionedUserId),
    attachments: row.attachments.map((attachment) => ({ ...attachment })),
    reactions: [...reactionMap].map(([emoji, summary]) => ({
      emoji,
      ...summary,
    })),
    poll: row.poll
      ? {
          id: row.poll.id,
          question: row.poll.question,
          multiple: row.poll.multiple,
          anonymous: row.poll.anonymous,
          closesAt: row.poll.closesAt?.toISOString() ?? null,
          closedAt: row.poll.closedAt?.toISOString() ?? null,
          options: row.poll.options.map((option) => ({
            id: option.id,
            label: option.label,
            sortOrder: option.sortOrder,
            voteCount: option.votes.length,
            selectedByMe: option.votes.some((vote) => vote.userId === viewerId),
            voters: row.poll?.anonymous !== false
              ? []
              : option.votes.map((vote) => vote.user),
          })),
        }
      : null,
    event: row.event
      ? {
          id: row.event.id,
          title: row.event.title,
          description: row.event.description,
          startsAt: row.event.startsAt.toISOString(),
          endsAt: row.event.endsAt.toISOString(),
          timezone: row.event.timezone,
          location: row.event.location,
          onlineUrl: row.event.onlineUrl,
          myResponse:
            row.event.responses.find((response) => response.userId === viewerId)
              ?.status ?? null,
        }
      : null,
    starredByMe: row.stars.some((star) => star.userId === viewerId),
    pinned: row.pinnedIn.length > 0,
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function titleFor(row: ConversationRow, viewerId: string): string {
  if (row.type === ChatConversationType.GROUP) return row.title ?? "Adsız grup";
  return (
    row.members.find((member) => member.userId !== viewerId)?.user.name ??
    "Sohbet"
  );
}

function conversationView(
  row: ConversationRow,
  viewerId: string,
  unreadCount: number,
): ChatConversation {
  const membership = row.members.find((member) => member.userId === viewerId);
  const visibleFrom = latestDate(
    membership?.visibleFrom,
    membership?.clearedAt,
  );
  const lastVisibleMessage = row.messages.find(
    (message) => message.createdAt >= visibleFrom,
  );
  return {
    id: row.id,
    type: row.type,
    title: titleFor(row, viewerId),
    description: row.description,
    members: row.members.map((member) => ({
      user: member.user,
      role: member.role,
    })),
    lastMessage: lastVisibleMessage
      ? messageView(lastVisibleMessage, viewerId)
      : null,
    unreadCount,
    pinnedAt: membership?.pinnedAt?.toISOString() ?? null,
    mutedUntil: membership?.mutedUntil?.toISOString() ?? null,
    notificationLevel: membership?.notificationLevel ?? "ALL",
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireMembership(
  db: PrismaClient | Transaction,
  context: ChatContext,
  conversationId: string,
) {
  const member = await db.chatConversationMember.findFirst({
    where: {
      tenantId: context.tenantId,
      conversationId,
      userId: context.userId,
      leftAt: null,
      conversation: { deletedAt: null },
    },
  });
  if (!member) throw new NotFoundError("Sohbet", conversationId);
  return member;
}

async function requireMessage(
  db: PrismaClient | Transaction,
  context: ChatContext,
  messageId: string,
  conversationId?: string,
) {
  const message = await db.chatMessage.findFirst({
    where: {
      tenantId: context.tenantId,
      id: messageId,
      ...(conversationId ? { conversationId } : {}),
      conversation: {
        deletedAt: null,
        members: { some: { userId: context.userId, leftAt: null } },
      },
    },
    include: {
      ...messageInclude,
      conversation: {
        select: {
          members: {
            where: { userId: context.userId, leftAt: null },
            select: { visibleFrom: true, clearedAt: true },
          },
        },
      },
    },
  });
  const membership = message?.conversation.members[0];
  if (!message || !membership) throw new NotFoundError("Mesaj", messageId);
  const visibleFrom =
    membership.clearedAt && membership.clearedAt > membership.visibleFrom
      ? membership.clearedAt
      : membership.visibleFrom;
  if (message.createdAt < visibleFrom) throw new NotFoundError("Mesaj", messageId);
  return message;
}

function latestDate(...dates: Array<Date | null | undefined>): Date {
  return dates.reduce<Date>(
    (latest, date) => (date && date > latest ? date : latest),
    new Date(0),
  );
}

async function emit(
  db: PrismaClient | Transaction,
  tenantId: string,
  conversationId: string,
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await db.chatRealtimeOutbox.create({
    data: { tenantId, conversationId, type, payload },
  });
}

export class PrismaChatRepository implements ChatRepository {
  constructor(private readonly db: PrismaClient) {}

  async getUnreadCount(context: ChatContext): Promise<number> {
    const memberships = await this.db.chatConversationMember.findMany({
      where: {
        tenantId: context.tenantId,
        userId: context.userId,
        leftAt: null,
        archivedAt: null,
        notificationLevel: { not: 'NONE' },
        conversation: { deletedAt: null },
      },
      select: {
        conversationId: true,
        lastReadAt: true,
        clearedAt: true,
        visibleFrom: true,
      },
    });
    const counts = await Promise.all(
      memberships.map((membership) =>
        this.db.chatMessage.count({
          where: {
            tenantId: context.tenantId,
            conversationId: membership.conversationId,
            senderId: { not: context.userId },
            deletedAt: null,
            createdAt: {
              gt: latestDate(
                membership.lastReadAt,
                membership.clearedAt,
                membership.visibleFrom,
              ),
            },
          },
        }),
      ),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  async listConversations(
    context: ChatContext,
    cursor: string | undefined,
    limit: number,
  ): Promise<ChatPage<ChatConversation>> {
    const rows = await this.db.chatConversation.findMany({
      where: {
        tenantId: context.tenantId,
        deletedAt: null,
        members: {
          some: { userId: context.userId, leftAt: null, archivedAt: null },
        },
      },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const items = await Promise.all(
      page.map(async (row) => {
        const membership = row.members.find(
          (member) => member.userId === context.userId,
        );
        const unreadCount = await this.db.chatMessage.count({
          where: {
            tenantId: context.tenantId,
            conversationId: row.id,
            senderId: { not: context.userId },
            deletedAt: null,
            createdAt: {
              gt: latestDate(
                membership?.lastReadAt,
                membership?.clearedAt,
                membership?.visibleFrom,
              ),
            },
          },
        });
        return conversationView(row, context.userId, unreadCount);
      }),
    );
    return {
      items,
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async createConversation(
    context: ChatContext,
    input: ConversationCreateRecord,
  ): Promise<ChatConversation> {
    const memberIds = [...new Set([context.userId, ...input.memberIds])];
    const activeCount = await this.db.tenantUser.count({
      where: {
        tenantId: context.tenantId,
        userId: { in: memberIds },
        isActive: true,
        user: { isActive: true, deletedAt: null },
      },
    });
    if (activeCount !== memberIds.length)
      throw new ValidationError(
        "Katılımcılardan biri aktif tenant kullanıcısı değil.",
      );
    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.chatConversation.create({
        data: {
          tenantId: context.tenantId,
          type: input.type,
          title: input.title,
          description: input.description,
          directKey: input.directKey,
          historyVisibility: input.historyVisibility ?? "FROM_JOIN",
          createdById: context.userId,
          members: {
            create: memberIds.map((userId) => ({
              tenantId: context.tenantId,
              userId,
              role: userId === context.userId ? "OWNER" : "MEMBER",
              visibleFrom: new Date(),
            })),
          },
        },
        include: conversationInclude,
      });
      await emit(tx, context.tenantId, row.id, "conversation.updated", {
        conversationId: row.id,
      });
      return row;
    });
    return conversationView(created, context.userId, 0);
  }

  async findDirect(
    context: ChatContext,
    directKey: string,
  ): Promise<ChatConversation | null> {
    const row = await this.db.chatConversation.findFirst({
      where: {
        tenantId: context.tenantId,
        directKey,
        deletedAt: null,
        members: { some: { userId: context.userId, leftAt: null } },
      },
      include: conversationInclude,
    });
    return row ? conversationView(row, context.userId, 0) : null;
  }

  async getConversation(
    context: ChatContext,
    conversationId: string,
  ): Promise<ChatConversation> {
    await requireMembership(this.db, context, conversationId);
    const row = await this.db.chatConversation.findFirst({
      where: {
        tenantId: context.tenantId,
        id: conversationId,
        deletedAt: null,
      },
      include: conversationInclude,
    });
    if (!row) throw new NotFoundError("Sohbet", conversationId);
    return conversationView(row, context.userId, 0);
  }

  async updateConversation(
    context: ChatContext,
    conversationId: string,
    input: { title?: string; description?: string | null },
  ): Promise<ChatConversation> {
    const member = await requireMembership(this.db, context, conversationId);
    assertGroupManager(member.role);
    const group = await this.db.chatConversation.findFirst({
      where: {
        id: conversationId,
        tenantId: context.tenantId,
        type: ChatConversationType.GROUP,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!group) throw new ValidationError("Yalnız grup bilgileri düzenlenebilir.");
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.chatConversation.update({
        where: { id: conversationId, tenantId: context.tenantId },
        data: input,
        include: conversationInclude,
      });
      await emit(tx, context.tenantId, conversationId, "conversation.updated", {
        conversationId,
      });
      return updated;
    });
    return conversationView(row, context.userId, 0);
  }

  async listMessages(
    context: ChatContext,
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ChatPage<ChatMessage>> {
    const member = await requireMembership(this.db, context, conversationId);
    const rows = await this.db.chatMessage.findMany({
      where: {
        tenantId: context.tenantId,
        conversationId,
        createdAt: {
          gte:
            member.clearedAt && member.clearedAt > member.visibleFrom
              ? member.clearedAt
              : member.visibleFrom,
          ...(member.leftAt ? { lt: member.leftAt } : {}),
        },
      },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => messageView(row, context.userId)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async sendMessage(
    context: ChatContext,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<ChatMessage> {
    const result = await this.db.$transaction(async (tx) => {
      await requireMembership(tx, context, conversationId);
      const existing = await tx.chatMessage.findFirst({
        where: {
          tenantId: context.tenantId,
          conversationId,
          senderId: context.userId,
          clientMessageId: input.clientMessageId,
        },
        include: messageInclude,
      });
      if (existing) return existing;
      if (input.replyToMessageId)
        await requireMessage(tx, context, input.replyToMessageId, conversationId);
      const mentions = [
        ...new Set(input.mentionUserIds.filter((id) => id !== context.userId)),
      ];
      const validMentions = await tx.chatConversationMember.count({
        where: {
          tenantId: context.tenantId,
          conversationId,
          userId: { in: mentions },
          leftAt: null,
        },
      });
      if (validMentions !== mentions.length)
        throw new ValidationError("Bahsedilen kullanıcı sohbet üyesi değil.");
      const attachments =
        input.attachmentIds.length === 0
          ? []
          : await tx.chatAttachment.findMany({
              where: {
                tenantId: context.tenantId,
                id: { in: input.attachmentIds },
                uploaderId: context.userId,
                messageId: null,
                status: "READY",
              },
            });
      if (attachments.length !== input.attachmentIds.length)
        throw new ValidationError("Dosyalardan biri kullanıma hazır değil.");
      const created = await tx.chatMessage.create({
        data: {
          tenantId: context.tenantId,
          conversationId,
          senderId: context.userId,
          clientMessageId: input.clientMessageId,
          content: input.content,
          type: input.type,
          replyToMessageId: input.replyToMessageId,
          forwardedFromMessageId: input.forwardedFromMessageId,
          forwardedSnapshot: input.forwardedSnapshot,
          mentions: {
            create: mentions.map((mentionedUserId) => ({
              tenantId: context.tenantId,
              mentionedUserId,
            })),
          },
        },
        include: messageInclude,
      });
      if (input.attachmentIds.length > 0)
        await tx.chatAttachment.updateMany({
          where: {
            tenantId: context.tenantId,
            id: { in: input.attachmentIds },
          },
          data: { messageId: created.id, expiresAt: null },
        });
      await tx.chatConversation.update({
        where: { id: conversationId, tenantId: context.tenantId },
        data: { lastMessageAt: created.createdAt },
      });
      await emit(tx, context.tenantId, conversationId, "message.created", {
        messageId: created.id,
      });
      return input.attachmentIds.length > 0
        ? requireMessage(tx, context, created.id)
        : created;
    });
    return messageView(result, context.userId);
  }

  async editMessage(
    context: ChatContext,
    messageId: string,
    content: string,
    expectedUpdatedAt?: Date,
  ): Promise<ChatMessage> {
    const updated = await this.db.$transaction(async (tx) => {
      const message = await requireMessage(tx, context, messageId);
      assertMessageMutation({ ...message, actorId: context.userId });
      if (
        expectedUpdatedAt &&
        message.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        throw new ConflictError(
          "Mesaj başka bir işlem tarafından güncellendi.",
        );
      await tx.chatMessageRevision.create({
        data: {
          tenantId: context.tenantId,
          messageId,
          editorId: context.userId,
          previousContent: message.content,
        },
      });
      const row = await tx.chatMessage.update({
        where: { id: messageId, tenantId: context.tenantId },
        data: { content, editedAt: new Date() },
        include: messageInclude,
      });
      await emit(
        tx,
        context.tenantId,
        message.conversationId,
        "message.updated",
        { messageId },
      );
      return row;
    });
    return messageView(updated, context.userId);
  }

  async deleteMessage(
    context: ChatContext,
    messageId: string,
  ): Promise<ChatMessage> {
    const updated = await this.db.$transaction(async (tx) => {
      const message = await requireMessage(tx, context, messageId);
      assertMessageMutation({ ...message, actorId: context.userId });
      const row = await tx.chatMessage.update({
        where: { id: messageId, tenantId: context.tenantId },
        data: {
          content: null,
          deletedAt: new Date(),
          deletedById: context.userId,
        },
        include: messageInclude,
      });
      await emit(
        tx,
        context.tenantId,
        message.conversationId,
        "message.deleted",
        { messageId },
      );
      return row;
    });
    return messageView(updated, context.userId);
  }

  async forwardMessage(
    context: ChatContext,
    messageId: string,
    conversationIds: string[],
  ): Promise<ChatMessage[]> {
    const source = await requireMessage(this.db, context, messageId);
    if (source.deletedAt)
      throw new ValidationError("Silinmiş mesaj iletilemez.");
    const snapshotContent = forwardedContent(source);
    return Promise.all(
      conversationIds.map((conversationId) =>
        this.sendMessage(context, conversationId, {
          clientMessageId: crypto.randomUUID(),
          content: snapshotContent,
          type: ChatMessageType.TEXT,
          attachmentIds: [],
          mentionUserIds: [],
          forwardedFromMessageId: source.id,
          forwardedSnapshot: {
            senderName: source.sender.name,
            content: snapshotContent,
            sourceType: source.type,
            createdAt: source.createdAt.toISOString(),
          },
        }),
      ),
    );
  }

  async markRead(
    context: ChatContext,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const member = await requireMembership(this.db, context, conversationId);
    const message = await requireMessage(this.db, context, messageId, conversationId);
    if (message.conversationId !== conversationId)
      throw new ValidationError("Mesaj bu sohbete ait değil.");
    if (member.lastReadAt && member.lastReadAt >= message.createdAt) return;
    await this.db.chatConversationMember.update({
      where: { id: member.id },
      data: { lastReadMessageId: messageId, lastReadAt: message.createdAt },
    });
  }

  async updatePreferences(
    context: ChatContext,
    conversationId: string,
    input: ConversationPreferencesInput,
  ): Promise<void> {
    const member = await requireMembership(this.db, context, conversationId);
    await this.db.chatConversationMember.update({
      where: { id: member.id },
      data: {
        ...(input.pinned !== undefined
          ? { pinnedAt: input.pinned ? new Date() : null }
          : {}),
        ...(input.mutedUntil !== undefined
          ? { mutedUntil: input.mutedUntil }
          : {}),
        ...(input.notificationLevel !== undefined
          ? { notificationLevel: input.notificationLevel }
          : {}),
        ...(input.archived !== undefined
          ? { archivedAt: input.archived ? new Date() : null }
          : {}),
      },
    });
  }

  async clearConversation(
    context: ChatContext,
    conversationId: string,
  ): Promise<void> {
    const member = await requireMembership(this.db, context, conversationId);
    await this.db.chatConversationMember.update({
      where: { id: member.id },
      data: { clearedAt: new Date(), lastReadAt: new Date() },
    });
  }

  async setStar(
    context: ChatContext,
    messageId: string,
    starred: boolean,
  ): Promise<void> {
    await requireMessage(this.db, context, messageId);
    if (starred)
      await this.db.chatMessageStar.upsert({
        where: { messageId_userId: { messageId, userId: context.userId } },
        create: {
          tenantId: context.tenantId,
          messageId,
          userId: context.userId,
        },
        update: {},
      });
    else
      await this.db.chatMessageStar.deleteMany({
        where: {
          tenantId: context.tenantId,
          messageId,
          userId: context.userId,
        },
      });
  }

  async setMessagePin(
    context: ChatContext,
    messageId: string,
    pinned: boolean,
  ): Promise<void> {
    const message = await requireMessage(this.db, context, messageId);
    const member = await requireMembership(
      this.db,
      context,
      message.conversationId,
    );
    const conversation = await this.db.chatConversation.findFirst({
      where: { tenantId: context.tenantId, id: message.conversationId },
    });
    if (conversation?.type === "GROUP") assertGroupManager(member.role);
    if (pinned) {
      const count = await this.db.chatPinnedMessage.count({
        where: {
          tenantId: context.tenantId,
          conversationId: message.conversationId,
        },
      });
      if (count >= CHAT_LIMITS.pinnedMessages)
        throw new ConflictError("Sabitlenmiş mesaj limiti doldu.");
      await this.db.chatPinnedMessage.upsert({
        where: {
          conversationId_messageId: {
            conversationId: message.conversationId,
            messageId,
          },
        },
        create: {
          tenantId: context.tenantId,
          conversationId: message.conversationId,
          messageId,
          pinnedById: context.userId,
        },
        update: { pinnedById: context.userId, pinnedAt: new Date() },
      });
    } else
      await this.db.chatPinnedMessage.deleteMany({
        where: {
          tenantId: context.tenantId,
          conversationId: message.conversationId,
          messageId,
        },
      });
    await emit(this.db, context.tenantId, message.conversationId, "message.pinned", {
      messageId,
      pinned,
    });
  }

  async setReaction(
    context: ChatContext,
    messageId: string,
    emoji: string,
    reacted: boolean,
  ): Promise<void> {
    await requireMessage(this.db, context, messageId);
    if (reacted)
      await this.db.chatMessageReaction.upsert({
        where: {
          messageId_userId_emoji: { messageId, userId: context.userId, emoji },
        },
        create: {
          tenantId: context.tenantId,
          messageId,
          userId: context.userId,
          emoji,
        },
        update: {},
      });
    else
      await this.db.chatMessageReaction.deleteMany({
        where: {
          tenantId: context.tenantId,
          messageId,
          userId: context.userId,
          emoji,
        },
      });
    const message = await requireMessage(this.db, context, messageId);
    await emit(this.db, context.tenantId, message.conversationId, "message.reaction_updated", {
      messageId,
      emoji,
    });
  }

  async search(
    context: ChatContext,
    input: SearchInput,
  ): Promise<ChatPage<ChatMessage>> {
    const memberships = await this.db.chatConversationMember.findMany({
      where: {
        tenantId: context.tenantId,
        userId: context.userId,
        leftAt: null,
        conversation: { deletedAt: null },
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
      },
      select: { conversationId: true, visibleFrom: true, clearedAt: true },
    });
    if (memberships.length === 0) return { items: [], nextCursor: null };
    const visibility = memberships.map((membership) => ({
      conversationId: membership.conversationId,
      createdAt: {
        gte: latestDate(membership.visibleFrom, membership.clearedAt, input.from),
        ...(input.to ? { lte: input.to } : {}),
      },
    }));
    const rows = await this.db.chatMessage.findMany({
      where: {
        tenantId: context.tenantId,
        deletedAt: null,
        content: { contains: input.q, mode: "insensitive" },
        ...(input.senderId ? { senderId: input.senderId } : {}),
        ...(input.hasAttachment === true ? { attachments: { some: {} } } : {}),
        OR: visibility,
      },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, input.limit);
    return {
      items: page.map((row) => messageView(row, context.userId)),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async addMembers(
    context: ChatContext,
    conversationId: string,
    userIds: string[],
    maxMembers: number,
  ): Promise<void> {
    const manager = await requireMembership(this.db, context, conversationId);
    assertGroupManager(manager.role);
    const conversation = await this.db.chatConversation.findFirst({
      where: { tenantId: context.tenantId, id: conversationId, type: "GROUP" },
    });
    if (!conversation)
      throw new ValidationError("Yalnız gruplara üye eklenebilir.");
    const valid = await this.db.tenantUser.count({
      where: {
        tenantId: context.tenantId,
        userId: { in: userIds },
        isActive: true,
      },
    });
    if (valid !== userIds.length)
      throw new ValidationError("Kullanıcılardan biri tenant üyesi değil.");
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "chat_conversations" WHERE "id" = ${conversationId} AND "tenantId" = ${context.tenantId} FOR UPDATE`);
      const activeCount = await tx.chatConversationMember.count({ where: { tenantId: context.tenantId, conversationId, leftAt: null } });
      const alreadyActive = await tx.chatConversationMember.count({ where: { tenantId: context.tenantId, conversationId, userId: { in: userIds }, leftAt: null } });
      if (activeCount + userIds.length - alreadyActive > maxMembers) throw new ValidationError(`Planınızda grup üye sınırı ${maxMembers}.`);
      await Promise.all(userIds.map((userId) =>
        tx.chatConversationMember.upsert({
          where: { conversationId_userId: { conversationId, userId } },
          create: {
            tenantId: context.tenantId,
            conversationId,
            userId,
            visibleFrom:
              conversation.historyVisibility === "ALL"
                ? conversation.createdAt
                : new Date(),
          },
          update: {
            leftAt: null,
            joinedAt: new Date(),
            visibleFrom:
              conversation.historyVisibility === "ALL"
                ? conversation.createdAt
                : new Date(),
          },
        }),
      ));
    });
    await emit(this.db, context.tenantId, conversationId, "conversation.member_added", {
      userIds,
    });
  }

  async removeMember(
    context: ChatContext,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const actor = await requireMembership(this.db, context, conversationId);
    const group = await this.db.chatConversation.findFirst({
      where: { tenantId: context.tenantId, id: conversationId, type: "GROUP", deletedAt: null },
      select: { id: true },
    });
    if (!group) throw new ValidationError("Yalnız grup üyeliği değiştirilebilir.");
    if (userId !== context.userId) assertGroupManager(actor.role);
    const target = await this.db.chatConversationMember.findFirst({
      where: {
        tenantId: context.tenantId,
        conversationId,
        userId,
        leftAt: null,
      },
    });
    if (!target) throw new NotFoundError("Grup üyesi", userId);
    if (target.role === "OWNER") {
      const owners = await this.db.chatConversationMember.count({
        where: {
          tenantId: context.tenantId,
          conversationId,
          role: "OWNER",
          leftAt: null,
        },
      });
      if (owners <= 1)
        throw new ConflictError("Son grup sahibi ayrılamaz veya çıkarılamaz.");
    }
    await this.db.chatConversationMember.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
    });
    await emit(this.db, context.tenantId, conversationId, "conversation.member_removed", {
      userId,
    });
  }

  async updateMemberRole(
    context: ChatContext,
    conversationId: string,
    userId: string,
    role: ChatMemberRole,
  ): Promise<void> {
    const actor = await requireMembership(this.db, context, conversationId);
    const group = await this.db.chatConversation.findFirst({
      where: { tenantId: context.tenantId, id: conversationId, type: "GROUP", deletedAt: null },
      select: { id: true },
    });
    if (!group) throw new ValidationError("Yalnız grup rolleri değiştirilebilir.");
    if (actor.role !== "OWNER")
      throw new ForbiddenError("Rol atamak için grup sahibi olmalısınız.");
    const target = await this.db.chatConversationMember.findFirst({
      where: {
        tenantId: context.tenantId,
        conversationId,
        userId,
        leftAt: null,
      },
    });
    if (!target) throw new NotFoundError("Grup üyesi", userId);
    if (target.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await this.db.chatConversationMember.count({
        where: { tenantId: context.tenantId, conversationId, role: "OWNER", leftAt: null },
      });
      if (ownerCount <= 1) throw new ConflictError("Son grup sahibi düşürülemez.");
    }
    await this.db.chatConversationMember.update({
      where: { id: target.id },
      data: { role },
    });
    await emit(this.db, context.tenantId, conversationId, "conversation.member_role_changed", {
      userId,
      role,
    });
  }

  async createInvite(
    context: ChatContext,
    conversationId: string,
    inviteeId: string,
    expiresAt: Date,
  ): Promise<{ id: string }> {
    const actor = await requireMembership(this.db, context, conversationId);
    assertGroupManager(actor.role);
    const active = await this.db.tenantUser.count({
      where: { tenantId: context.tenantId, userId: inviteeId, isActive: true },
    });
    if (!active)
      throw new ValidationError("Davet edilecek kullanıcı tenant üyesi değil.");
    const group = await this.db.chatConversation.findFirst({
      where: { tenantId: context.tenantId, id: conversationId, type: "GROUP", deletedAt: null },
      select: { id: true },
    });
    if (!group) throw new ValidationError("Yalnız gruplara davet gönderilebilir.");
    return this.db.chatGroupInvite.upsert({
      where: { conversationId_inviteeId_status: { conversationId, inviteeId, status: "PENDING" } },
      create: { tenantId: context.tenantId, conversationId, inviterId: context.userId, inviteeId, expiresAt },
      update: { inviterId: context.userId, expiresAt, respondedAt: null },
      select: { id: true },
    });
  }

  async respondInvite(
    context: ChatContext,
    inviteId: string,
    accept: boolean,
    maxMembers: number,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const invite = await tx.chatGroupInvite.findFirst({
        where: {
          tenantId: context.tenantId,
          id: inviteId,
          inviteeId: context.userId,
          status: "PENDING",
        },
      });
      if (!invite || invite.expiresAt <= new Date())
        throw new NotFoundError("Aktif davet", inviteId);
      await tx.chatGroupInvite.update({
        where: { id: invite.id },
        data: {
          status: accept ? "ACCEPTED" : "DECLINED",
          respondedAt: new Date(),
        },
      });
      if (accept)
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "chat_conversations" WHERE "id" = ${invite.conversationId} AND "tenantId" = ${context.tenantId} FOR UPDATE`);
      if (accept) {
        const memberCount = await tx.chatConversationMember.count({ where: { tenantId: context.tenantId, conversationId: invite.conversationId, leftAt: null } });
        const alreadyActive = await tx.chatConversationMember.count({ where: { tenantId: context.tenantId, conversationId: invite.conversationId, userId: context.userId, leftAt: null } });
        if (memberCount + (alreadyActive ? 0 : 1) > maxMembers) throw new ConflictError(`Planınızda grup üye sınırı ${maxMembers}.`);
      }
      if (accept)
        await tx.chatConversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: invite.conversationId,
              userId: context.userId,
            },
          },
          create: {
            tenantId: context.tenantId,
            conversationId: invite.conversationId,
            userId: context.userId,
          },
          update: {
            leftAt: null,
            joinedAt: new Date(),
            visibleFrom: new Date(),
          },
        });
      if (accept)
        await emit(tx, context.tenantId, invite.conversationId, "conversation.member_added", {
          userIds: [context.userId],
        });
    });
  }

  async createPoll(
    context: ChatContext,
    conversationId: string,
    input: PollInput,
  ): Promise<ChatMessage> {
    const message = await this.sendMessage(context, conversationId, {
      clientMessageId: crypto.randomUUID(),
      content: input.question,
      type: "POLL",
      attachmentIds: [],
      mentionUserIds: [],
    });
    await this.db.chatPoll.create({
      data: {
        tenantId: context.tenantId,
        conversationId,
        messageId: message.id,
        question: input.question,
        multiple: input.multiple,
        anonymous: input.anonymous,
        closesAt: input.closesAt,
        createdById: context.userId,
        options: {
          create: input.options.map((label, sortOrder) => ({
            tenantId: context.tenantId,
            label,
            sortOrder,
          })),
        },
      },
    });
    return messageView(await requireMessage(this.db, context, message.id, conversationId), context.userId);
  }

  async votePoll(
    context: ChatContext,
    pollId: string,
    optionIds: string[],
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const poll = await tx.chatPoll.findFirst({
        where: {
          tenantId: context.tenantId,
          id: pollId,
          closedAt: null,
          conversation: {
            members: { some: { userId: context.userId, leftAt: null } },
          },
        },
        include: { options: { select: { id: true } } },
      });
      if (!poll || (poll.closesAt && poll.closesAt <= new Date()))
        throw new NotFoundError("Aktif anket", pollId);
      if (!poll.multiple && optionIds.length > 1)
        throw new ValidationError("Bu ankette tek seçenek seçilebilir.");
      const valid = new Set(poll.options.map((option) => option.id));
      if (optionIds.some((id) => !valid.has(id)))
        throw new ValidationError("Geçersiz anket seçeneği.");
      await tx.chatPollVote.deleteMany({
        where: { tenantId: context.tenantId, pollId, userId: context.userId },
      });
      await tx.chatPollVote.createMany({
        data: optionIds.map((optionId) => ({
          tenantId: context.tenantId,
          pollId,
          optionId,
          userId: context.userId,
        })),
      });
      await emit(tx, context.tenantId, poll.conversationId, "poll.updated", { pollId });
    });
  }

  async closePoll(context: ChatContext, pollId: string): Promise<void> {
    const poll = await this.db.chatPoll.findFirst({
      where: { tenantId: context.tenantId, id: pollId },
      include: {
        conversation: {
          include: {
            members: { where: { userId: context.userId, leftAt: null } },
          },
        },
      },
    });
    const member = poll?.conversation.members[0];
    if (!poll || !member) throw new NotFoundError("Anket", pollId);
    if (poll.createdById !== context.userId) assertGroupManager(member.role);
    await this.db.chatPoll.update({
      where: { id: pollId },
      data: { closedAt: new Date() },
    });
    await emit(this.db, context.tenantId, poll.conversationId, "poll.updated", { pollId });
  }

  async createEvent(
    context: ChatContext,
    conversationId: string,
    input: EventInput,
  ): Promise<ChatMessage> {
    const message = await this.sendMessage(context, conversationId, {
      clientMessageId: crypto.randomUUID(),
      content: input.title,
      type: "EVENT",
      attachmentIds: [],
      mentionUserIds: [],
    });
    await this.db.chatEvent.create({
      data: {
        tenantId: context.tenantId,
        conversationId,
        messageId: message.id,
        createdById: context.userId,
        ...input,
      },
    });
    return messageView(await requireMessage(this.db, context, message.id, conversationId), context.userId);
  }

  async respondEvent(
    context: ChatContext,
    eventId: string,
    status: "GOING" | "MAYBE" | "DECLINED",
  ): Promise<void> {
    const event = await this.db.chatEvent.findFirst({
      where: {
        tenantId: context.tenantId,
        id: eventId,
        conversation: {
          members: { some: { userId: context.userId, leftAt: null } },
        },
      },
    });
    if (!event) throw new NotFoundError("Etkinlik", eventId);
    await this.db.chatEventResponse.upsert({
      where: { eventId_userId: { eventId, userId: context.userId } },
      create: {
        tenantId: context.tenantId,
        eventId,
        userId: context.userId,
        status,
      },
      update: { status },
    });
    await emit(this.db, context.tenantId, event.conversationId, "event.updated", { eventId });
  }
}

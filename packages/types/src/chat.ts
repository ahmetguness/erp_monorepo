import { z } from "zod";

export const CHAT_MESSAGE_MAX_LENGTH = 10_000;

export const ChatConversationTypeSchema = z.enum(["DIRECT", "GROUP"]);
export const ChatMemberRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export const ChatMessageTypeSchema = z.enum([
  "TEXT",
  "FILE",
  "IMAGE",
  "SYSTEM",
  "POLL",
  "EVENT",
]);
export const ChatNotificationLevelSchema = z.enum(["ALL", "MENTIONS", "NONE"]);
export const ChatHistoryVisibilitySchema = z.enum(["ALL", "FROM_JOIN"]);
export const ChatAttachmentKindSchema = z.enum(["IMAGE", "DOCUMENT", "OTHER"]);
export const ChatAttachmentStatusSchema = z.enum([
  "PENDING_UPLOAD",
  "UPLOADED",
  "SCANNING",
  "READY",
  "REJECTED",
  "EXPIRED",
  "DELETED",
]);
export const ChatInviteStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "REVOKED",
  "EXPIRED",
]);
export const ChatEventResponseStatusSchema = z.enum([
  "GOING",
  "MAYBE",
  "DECLINED",
]);

export type ChatConversationType = z.infer<typeof ChatConversationTypeSchema>;
export type ChatMemberRole = z.infer<typeof ChatMemberRoleSchema>;
export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>;
export type ChatNotificationLevel = z.infer<typeof ChatNotificationLevelSchema>;
export type ChatAttachmentKind = z.infer<typeof ChatAttachmentKindSchema>;

export const ChatUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const ChatAttachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  kind: ChatAttachmentKindSchema,
  status: ChatAttachmentStatusSchema,
});

export const ChatReactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  reactedByMe: z.boolean(),
});

export const ChatPollViewSchema = z.object({
  id: z.string(),
  question: z.string(),
  multiple: z.boolean(),
  anonymous: z.boolean(),
  closesAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    sortOrder: z.number().int(),
    voteCount: z.number().int().nonnegative(),
    selectedByMe: z.boolean(),
    voters: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
});

export const ChatEventViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string(),
  location: z.string().nullable(),
  onlineUrl: z.string().url().nullable(),
  myResponse: ChatEventResponseStatusSchema.nullable(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  clientMessageId: z.string(),
  type: ChatMessageTypeSchema,
  content: z.string().nullable(),
  sender: ChatUserSchema,
  replyTo: z
    .object({
      id: z.string(),
      content: z.string().nullable(),
      senderName: z.string(),
    })
    .nullable(),
  forwarded: z.boolean(),
  mentionUserIds: z.array(z.string()),
  attachments: z.array(ChatAttachmentSchema),
  reactions: z.array(ChatReactionSummarySchema),
  poll: ChatPollViewSchema.nullable(),
  event: ChatEventViewSchema.nullable(),
  starredByMe: z.boolean(),
  pinned: z.boolean(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ChatConversationSchema = z.object({
  id: z.string(),
  type: ChatConversationTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  members: z.array(
    z.object({ user: ChatUserSchema, role: ChatMemberRoleSchema }),
  ),
  lastMessage: ChatMessageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  pinnedAt: z.string().datetime().nullable(),
  mutedUntil: z.string().datetime().nullable(),
  notificationLevel: ChatNotificationLevelSchema,
  updatedAt: z.string().datetime(),
});

export type ChatUser = z.infer<typeof ChatUserSchema>;
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatPollView = z.infer<typeof ChatPollViewSchema>;
export type ChatEventView = z.infer<typeof ChatEventViewSchema>;
export type ChatConversation = z.infer<typeof ChatConversationSchema>;

export const CreateDirectConversationSchema = z
  .object({ userId: z.string().min(1) })
  .strict();
export const CreateGroupConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    memberIds: z.array(z.string().min(1)).max(250).default([]),
    historyVisibility: ChatHistoryVisibilitySchema.default("FROM_JOIN"),
  })
  .strict();
export const UpdateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const SendChatMessageSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    content: z.string().trim().max(CHAT_MESSAGE_MAX_LENGTH).nullable().default(null),
    type: ChatMessageTypeSchema.default("TEXT"),
    replyToMessageId: z.string().nullable().optional(),
    attachmentIds: z.array(z.string()).max(10).default([]),
    mentionUserIds: z.array(z.string()).max(50).default([]),
  })
  .strict()
  .refine(
    (value) => Boolean(value.content) || value.attachmentIds.length > 0,
    "Mesaj metni veya eki zorunludur.",
  );
export const EditChatMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();
export const ForwardChatMessageSchema = z
  .object({ conversationIds: z.array(z.string()).min(1).max(10) })
  .strict();
export const MarkChatReadSchema = z.object({ messageId: z.string() }).strict();
export const ConversationPinSchema = z.object({ pinned: z.boolean() }).strict();
export const ConversationMuteSchema = z
  .object({
    mutedUntil: z.string().datetime().nullable(),
    notificationLevel: ChatNotificationLevelSchema.optional(),
  })
  .strict();
export const AddChatMembersSchema = z
  .object({ userIds: z.array(z.string()).min(1).max(250) })
  .strict();
export const UpdateChatMemberRoleSchema = z
  .object({ role: ChatMemberRoleSchema })
  .strict();
export const ChatReactionSchema = z
  .object({ emoji: z.string().trim().min(1).max(16) })
  .strict();
export const CreateChatInviteSchema = z
  .object({
    inviteeId: z.string(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
export const CreateChatPollSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(12),
    multiple: z.boolean().default(false),
    anonymous: z.boolean().default(false),
    closesAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export const VoteChatPollSchema = z
  .object({ optionIds: z.array(z.string()).min(1).max(12) })
  .strict();
export const CreateChatEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().trim().min(1).max(80),
    location: z.string().trim().max(300).nullable().optional(),
    onlineUrl: z.string().url().nullable().optional(),
  })
  .strict()
  .refine(
    (value) => new Date(value.endsAt) > new Date(value.startsAt),
    "Etkinlik bitişi başlangıçtan sonra olmalıdır.",
  );
export const RespondChatEventSchema = z
  .object({ status: ChatEventResponseStatusSchema })
  .strict();

export const ChatCursorPageSchema = z.object({
  items: z.array(ChatMessageSchema),
  nextCursor: z.string().nullable(),
});

export const ChatRealtimeEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "message.created",
    "message.updated",
    "message.deleted",
    "message.reaction_updated",
    "message.pinned",
    "conversation.updated",
    "conversation.member_added",
    "conversation.member_removed",
    "conversation.member_role_changed",
    "conversation.read_updated",
    "poll.updated",
    "event.updated",
    "sync.required",
  ]),
  tenantId: z.string(),
  conversationId: z.string(),
  occurredAt: z.string().datetime(),
  version: z.literal(1),
  payload: z.record(z.string(), z.unknown()),
});
export type ChatRealtimeEvent = z.infer<typeof ChatRealtimeEventSchema>;

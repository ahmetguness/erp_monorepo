import {
  AddChatMembersSchema,
  ChatReactionSchema,
  ConversationMuteSchema,
  ConversationPinSchema,
  CreateChatEventSchema,
  CreateChatInviteSchema,
  CreateChatPollSchema,
  CreateDirectConversationSchema,
  CreateGroupConversationSchema,
  EditChatMessageSchema,
  ForwardChatMessageSchema,
  MarkChatReadSchema,
  RespondChatEventSchema,
  SendChatMessageSchema,
  UpdateChatMemberRoleSchema,
  UpdateConversationSchema,
  VoteChatPollSchema,
} from '@repo/types/chat';
import type { z } from 'zod';
import { ValidationError } from '../../../../errors/index.js';

export function parseBody<TSchema extends z.ZodType>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]));
    throw new ValidationError('İstek doğrulanamadı.', fields);
  }
  return parsed.data;
}

export const chatSchemas = {
  direct: CreateDirectConversationSchema,
  group: CreateGroupConversationSchema,
  updateConversation: UpdateConversationSchema,
  send: SendChatMessageSchema,
  edit: EditChatMessageSchema,
  forward: ForwardChatMessageSchema,
  read: MarkChatReadSchema,
  pin: ConversationPinSchema,
  mute: ConversationMuteSchema,
  addMembers: AddChatMembersSchema,
  memberRole: UpdateChatMemberRoleSchema,
  reaction: ChatReactionSchema,
  invite: CreateChatInviteSchema,
  poll: CreateChatPollSchema,
  vote: VoteChatPollSchema,
  event: CreateChatEventSchema,
  eventResponse: RespondChatEventSchema,
} as const;

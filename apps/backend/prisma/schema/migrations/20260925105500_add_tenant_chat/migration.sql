-- CreateEnum
CREATE TYPE "ChatConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChatHistoryVisibility" AS ENUM ('ALL', 'FROM_JOIN');

-- CreateEnum
CREATE TYPE "ChatNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'FILE', 'IMAGE', 'SYSTEM', 'POLL', 'EVENT');

-- CreateEnum
CREATE TYPE "ChatAttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatAttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'SCANNING', 'READY', 'REJECTED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "ChatInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ChatEventResponseStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ChatConversationType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "directKey" TEXT,
    "historyVisibility" "ChatHistoryVisibility" NOT NULL DEFAULT 'FROM_JOIN',
    "retentionDays" INTEGER,
    "createdById" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_realtime_outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "chat_realtime_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversation_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "visibleFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "pinnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "notificationLevel" "ChatNotificationLevel" NOT NULL DEFAULT 'ALL',

    CONSTRAINT "chat_conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "replyToMessageId" TEXT,
    "forwardedFromMessageId" TEXT,
    "forwardedSnapshot" JSONB,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "previousContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message_mentions" (
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_mentions_pkey" PRIMARY KEY ("messageId","mentionedUserId")
);

-- CreateTable
CREATE TABLE "chat_message_stars" (
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_stars_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "chat_message_reactions" (
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

-- CreateTable
CREATE TABLE "chat_pinned_messages" (
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_pinned_messages_pkey" PRIMARY KEY ("conversationId","messageId")
);

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "messageId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "safeDisplayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "kind" "ChatAttachmentKind" NOT NULL,
    "status" "ChatAttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailStorageKey" TEXT,
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_invites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "ChatInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_polls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_poll_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "chat_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_poll_votes" (
    "tenantId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_poll_votes_pkey" PRIMARY KEY ("pollId","optionId","userId")
);

-- CreateTable
CREATE TABLE "chat_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "location" TEXT,
    "onlineUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_event_responses" (
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ChatEventResponseStatus" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_event_responses_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "chat_conversations_tenantId_lastMessageAt_idx" ON "chat_conversations"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_conversations_tenantId_type_deletedAt_idx" ON "chat_conversations"("tenantId", "type", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_tenantId_directKey_key" ON "chat_conversations"("tenantId", "directKey");

-- CreateIndex
CREATE INDEX "chat_realtime_outbox_tenantId_conversationId_createdAt_idx" ON "chat_realtime_outbox"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_realtime_outbox_processedAt_createdAt_idx" ON "chat_realtime_outbox"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "chat_conversation_members_tenantId_userId_pinnedAt_idx" ON "chat_conversation_members"("tenantId", "userId", "pinnedAt");

-- CreateIndex
CREATE INDEX "chat_conversation_members_tenantId_conversationId_leftAt_idx" ON "chat_conversation_members"("tenantId", "conversationId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversation_members_conversationId_userId_key" ON "chat_conversation_members"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "chat_messages_tenantId_conversationId_createdAt_id_idx" ON "chat_messages"("tenantId", "conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "chat_messages_tenantId_senderId_createdAt_idx" ON "chat_messages"("tenantId", "senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_tenantId_conversationId_senderId_clientMessag_key" ON "chat_messages"("tenantId", "conversationId", "senderId", "clientMessageId");

-- CreateIndex
CREATE INDEX "chat_message_revisions_tenantId_messageId_createdAt_idx" ON "chat_message_revisions"("tenantId", "messageId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_message_mentions_tenantId_mentionedUserId_createdAt_idx" ON "chat_message_mentions"("tenantId", "mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_message_stars_tenantId_userId_createdAt_idx" ON "chat_message_stars"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_message_reactions_tenantId_messageId_idx" ON "chat_message_reactions"("tenantId", "messageId");

-- CreateIndex
CREATE INDEX "chat_pinned_messages_tenantId_conversationId_pinnedAt_idx" ON "chat_pinned_messages"("tenantId", "conversationId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_attachments_storageKey_key" ON "chat_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "chat_attachments_tenantId_uploaderId_status_idx" ON "chat_attachments"("tenantId", "uploaderId", "status");

-- CreateIndex
CREATE INDEX "chat_attachments_tenantId_messageId_idx" ON "chat_attachments"("tenantId", "messageId");

-- CreateIndex
CREATE INDEX "chat_attachments_tenantId_expiresAt_idx" ON "chat_attachments"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "chat_group_invites_tenantId_inviteeId_status_idx" ON "chat_group_invites"("tenantId", "inviteeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chat_group_invites_conversationId_inviteeId_status_key" ON "chat_group_invites"("conversationId", "inviteeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chat_polls_messageId_key" ON "chat_polls"("messageId");

-- CreateIndex
CREATE INDEX "chat_polls_tenantId_conversationId_createdAt_idx" ON "chat_polls"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_poll_options_tenantId_pollId_idx" ON "chat_poll_options"("tenantId", "pollId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_poll_options_pollId_sortOrder_key" ON "chat_poll_options"("pollId", "sortOrder");

-- CreateIndex
CREATE INDEX "chat_poll_votes_tenantId_userId_idx" ON "chat_poll_votes"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_events_messageId_key" ON "chat_events"("messageId");

-- CreateIndex
CREATE INDEX "chat_events_tenantId_conversationId_startsAt_idx" ON "chat_events"("tenantId", "conversationId", "startsAt");

-- CreateIndex
CREATE INDEX "chat_event_responses_tenantId_userId_idx" ON "chat_event_responses"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_realtime_outbox" ADD CONSTRAINT "chat_realtime_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_realtime_outbox" ADD CONSTRAINT "chat_realtime_outbox_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_revisions" ADD CONSTRAINT "chat_message_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_revisions" ADD CONSTRAINT "chat_message_revisions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_revisions" ADD CONSTRAINT "chat_message_revisions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_stars" ADD CONSTRAINT "chat_message_stars_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_stars" ADD CONSTRAINT "chat_message_stars_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_stars" ADD CONSTRAINT "chat_message_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_pinned_messages" ADD CONSTRAINT "chat_pinned_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_pinned_messages" ADD CONSTRAINT "chat_pinned_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_pinned_messages" ADD CONSTRAINT "chat_pinned_messages_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_pinned_messages" ADD CONSTRAINT "chat_pinned_messages_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_invites" ADD CONSTRAINT "chat_group_invites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_invites" ADD CONSTRAINT "chat_group_invites_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_invites" ADD CONSTRAINT "chat_group_invites_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_invites" ADD CONSTRAINT "chat_group_invites_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_options" ADD CONSTRAINT "chat_poll_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_options" ADD CONSTRAINT "chat_poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "chat_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "chat_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "chat_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_event_responses" ADD CONSTRAINT "chat_event_responses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_event_responses" ADD CONSTRAINT "chat_event_responses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "chat_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_event_responses" ADD CONSTRAINT "chat_event_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search acceleration for tenant-scoped message lookup. The application still
-- applies conversation membership and visibility predicates before returning rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "chat_messages_content_trgm_idx"
  ON "chat_messages" USING GIN ("content" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

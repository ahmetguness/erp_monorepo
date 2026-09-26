import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { FeatureKey, StorageReservationSource } from '@prisma/client';
import { runWithTenantScope } from '../src/lib/tenant-isolation-context.js';
import { ChatService } from '../src/modules/collaboration/chat/application/chat.service.js';
import { PrismaChatRepository } from '../src/modules/collaboration/chat/infrastructure/persistence/prisma-chat.repository.js';
import { ChatAttachmentWorker, StoragePlanResolver, StorageReservationService } from '../src/modules/storage-accounting/index.js';
import { ChatUploadService } from '../src/modules/collaboration/chat/application/chat-upload.service.js';
import { storageService } from '../src/services/storage.service.js';

const suffix = randomUUID();
const tenantId = `chat-check-${suffix}`;
const userIds = [`chat-owner-${suffix}`, `chat-member-${suffix}`, `chat-invitee-${suffix}`];
const [ownerId, memberId, inviteeId] = userIds;

function messageInput(content: string) {
  return {
    clientMessageId: randomUUID(),
    content,
    type: 'TEXT' as const,
    attachmentIds: [],
    mentionUserIds: [],
  };
}

async function setup(): Promise<void> {
  await prisma.tenant.create({
    data: {
      id: tenantId,
      slug: `chat-check-${suffix}`,
      companyName: 'Chat Integration Check',
      email: `tenant-${suffix}@example.test`,
      trialEndsAt: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.user.createMany({
    data: userIds.map((id, index) => ({
      id,
      email: `chat-${index}-${suffix}@example.test`,
      name: `Chat Test ${index + 1}`,
      password: 'integration-test-not-a-login-secret',
    })),
  });
  await runWithTenantScope(tenantId, () => prisma.tenantUser.createMany({
    data: userIds.map((userId, index) => ({
      tenantId,
      userId,
      isOwner: index === 0,
      isActive: true,
    })),
  }));
}

async function cleanup(): Promise<void> {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function check(): Promise<void> {
  const service = new ChatService(new PrismaChatRepository(prisma), new StoragePlanResolver(prisma));
  const owner = { tenantId, userId: ownerId };
  const member = { tenantId, userId: memberId };
  const invitee = { tenantId, userId: inviteeId };

  await runWithTenantScope(tenantId, async () => {
    const direct = await service.createDirect(owner, memberId);
    const sameDirect = await service.createDirect(member, ownerId);
    assert.equal(sameDirect.id, direct.id, 'Direct sohbet idempotent olmali.');

    const firstInput = messageInput('chat integration unique message');
    const first = await service.sendMessage(owner, direct.id, firstInput);
    const duplicate = await service.sendMessage(owner, direct.id, firstInput);
    assert.equal(duplicate.id, first.id, 'Ayni clientMessageId yeni mesaj olusturmamali.');

    const attachment = await prisma.chatAttachment.create({
      data: {
        tenantId, uploaderId: ownerId, storageKey: `chat-check/${suffix}.txt`,
        originalName: 'check.txt', safeDisplayName: 'check.txt', mimeType: 'text/plain',
        sizeBytes: 5, kind: 'OTHER', status: 'READY',
      },
    });
    const fileInput = { ...messageInput('file message'), type: 'FILE' as const, attachmentIds: [attachment.id] };
    const fileMessage = await service.sendMessage(owner, direct.id, fileInput);
    const fileRetry = await service.sendMessage(owner, direct.id, fileInput);
    assert.equal(fileRetry.id, fileMessage.id, 'Dosyali mesaj tekrar gonderimi idempotent olmali.');

    const reply = await service.sendMessage(member, direct.id, {
      ...messageInput('reply message'),
      replyToMessageId: first.id,
      mentionUserIds: [ownerId],
    });
    assert.equal(reply.replyTo?.id, first.id);
    assert.equal(await service.getUnreadCount(owner), 1, 'Karsi taraftan gelen mesaj sol menu rozetine yansimali.');
    await service.markRead(owner, direct.id, reply.id);
    assert.equal(await service.getUnreadCount(owner), 0, 'Okunan mesaj sol menu rozetinden dusmeli.');
    await service.setStar(owner, reply.id, true);
    await service.setReaction(owner, reply.id, '✅', true);
    await service.setMessagePin(owner, reply.id, true);

    const edited = await service.editMessage(owner, first.id, 'edited integration message', new Date(first.updatedAt));
    assert.equal(edited.content, 'edited integration message');
    const search = await service.search(owner, { q: 'edited integration', conversationId: direct.id, limit: 20 });
    assert.equal(search.items[0]?.id, first.id);

    const group = await service.createGroup(owner, {
      title: 'Integration Group',
      memberIds: [memberId],
      historyVisibility: 'FROM_JOIN',
    });
    await service.updateConversation(owner, group.id, { description: 'Checked end to end' });
    const groupMessage = await service.sendMessage(owner, group.id, messageInput('group message'));
    const forwarded = await service.forwardMessage(owner, first.id, [group.id]);
    assert.equal(forwarded[0]?.forwarded, true);

    const pollMessage = await service.createPoll(owner, group.id, {
      question: 'Ready?', options: ['Yes', 'No'], multiple: false, anonymous: false,
    });
    assert.equal(pollMessage.poll?.options.length, 2, 'Anket ayrintilari mesaj sozlesmesinde donmeli.');
    const forwardedPoll = await service.forwardMessage(owner, pollMessage.id, [direct.id]);
    assert.match(forwardedPoll[0]?.content ?? '', /^Anket: Ready\?/, 'Anket iletimi okunabilir bir snapshot olusturmali.');
    const poll = await prisma.chatPoll.findFirstOrThrow({
      where: { tenantId, messageId: pollMessage.id }, include: { options: true },
    });
    await service.votePoll(member, poll.id, [poll.options[0]!.id]);
    const pollAfterVote = (await service.listMessages(owner, group.id)).items.find((item) => item.id === pollMessage.id)?.poll;
    assert.equal(pollAfterVote?.options[0]?.voters[0]?.name, 'Chat Test 2', 'Acik ankette oy veren kullanici gorunmeli.');
    await service.closePoll(owner, poll.id);

    const now = Date.now();
    const eventMessage = await service.createEvent(owner, group.id, {
      title: 'Integration Event', startsAt: new Date(now + 3_600_000),
      endsAt: new Date(now + 7_200_000), timezone: 'Europe/Istanbul',
    });
    assert.equal(eventMessage.event?.title, 'Integration Event', 'Etkinlik ayrintilari mesaj sozlesmesinde donmeli.');
    const event = await prisma.chatEvent.findFirstOrThrow({ where: { tenantId, messageId: eventMessage.id } });
    await service.respondEvent(member, event.id, 'GOING');

    const invite = await service.createInvite(owner, group.id, inviteeId);
    await service.respondInvite(invitee, invite.id, true);
    const joined = await service.getConversation(invitee, group.id);
    assert(joined.members.some((entry) => entry.user.id === inviteeId));

    await service.updateMemberRole(owner, group.id, memberId, 'ADMIN');
    await service.removeMember(owner, group.id, memberId);
    await assert.rejects(() => service.getConversation(member, group.id));
    await service.addMembers(owner, group.id, [memberId]);

    await service.clearConversation(owner, direct.id);
    assert.equal((await service.listMessages(owner, direct.id)).items.length, 0);
    assert.equal((await service.search(owner, { q: 'edited integration', conversationId: direct.id, limit: 20 })).items.length, 0);
    const clearedConversation = (await service.listConversations(owner)).items.find((item) => item.id === direct.id);
    assert.equal(clearedConversation?.lastMessage, null, 'Temizlenen sohbetin son mesaj onizlemesi gorunmemeli.');
    await assert.rejects(() => service.setStar(owner, first.id, false));

    const deleted = await service.deleteMessage(owner, groupMessage.id);
    assert(deleted.deletedAt);
    const outboxCount = await prisma.chatRealtimeOutbox.count({ where: { tenantId } });
    assert(outboxCount >= 8, 'Realtime outbox olaylari olusmali.');
  });
}

async function checkStorageAccounting(): Promise<void> {
  await runWithTenantScope(tenantId, async () => {
    await prisma.tenantFeatureOverride.create({
      data: { tenantId, featureKey: FeatureKey.STORAGE_LIMIT_BYTES, value: '10', reason: 'integration-test' },
    });
    const accounting = new StorageReservationService(prisma);
    const attempts = await Promise.allSettled([0, 1, 2].map((index) => accounting.reserve({
      tenantId, source: StorageReservationSource.CHAT_ATTACHMENT,
      objectKey: `${tenantId}/atomic-${index}-${suffix}.txt`, originalName: 'atomic.txt',
      contentType: 'text/plain', createdById: ownerId, expectedBytes: 6,
    })));
    const accepted = attempts.filter((result) => result.status === 'fulfilled');
    assert.equal(accepted.length, 1, 'Eszamanli rezervasyonlar ortak kotayi asmamali.');
    const reservation = accepted[0];
    if (reservation?.status === 'fulfilled') await accounting.release(tenantId, reservation.value.id, 'CANCELLED');
    const usage = await prisma.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId } });
    assert.equal(usage.reservedBytes, 0n, 'Rezervasyon serbest birakilinca ayrilan kota sifirlanmali.');
    await prisma.tenantFeatureOverride.delete({ where: { tenantId_featureKey: { tenantId, featureKey: FeatureKey.STORAGE_LIMIT_BYTES } } });

    const uploads = new ChatUploadService(prisma, storageService);
    const body = Buffer.from('hello');
    const ticket = await uploads.createTicket({ tenantId, userId: ownerId, originalName: 'worker.txt', contentType: 'text/plain', sizeBytes: body.length });
    await uploads.uploadProxy(tenantId, ownerId, ticket.reservationId, body, 'text/plain');
    await ChatAttachmentWorker.processBatch();
    const status = await uploads.status(tenantId, ownerId, ticket.reservationId);
    assert.equal(status.reservationStatus, 'COMMITTED');
    assert.equal(status.attachment?.status, 'READY');
    await storageService.delete(`${tenantId}/chat/${ticket.attachmentId}.txt`);
  });
}

async function main(): Promise<void> {
  try {
    await setup();
    await checkStorageAccounting();
    await check();
    console.log('Chat integration check: PASS');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Chat integration check: FAIL', error);
  process.exitCode = 1;
});

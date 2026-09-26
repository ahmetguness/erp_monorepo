import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../src/lib/tenant-isolation-context.js';
import { ChatService } from '../src/modules/collaboration/chat/application/chat.service.js';
import { PrismaChatRepository } from '../src/modules/collaboration/chat/infrastructure/persistence/prisma-chat.repository.js';
import { StoragePlanResolver } from '../src/modules/storage-accounting/index.js';

const TENANT_SLUG = 'axon-demo';
const SENDER_EMAIL = 'satis@axondemo.com';
const RECIPIENT_EMAIL = 'admin@axondemo.com';
const TEST_MESSAGE = 'Merhaba Ahmet, bu Zeynep Kaya tarafından gönderilen sohbet bildirim testi mesajıdır.';

async function main(): Promise<void> {
  const identities = await runWithTenantIsolationBypass('admin-console', async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
    const users = await prisma.user.findMany({
      where: { email: { in: [SENDER_EMAIL, RECIPIENT_EMAIL] }, isActive: true },
      select: { id: true, email: true, name: true },
    });
    return { tenant, users };
  });

  if (!identities.tenant) throw new Error(`Seed tenant bulunamadı: ${TENANT_SLUG}`);
  const sender = identities.users.find((user) => user.email === SENDER_EMAIL);
  const recipient = identities.users.find((user) => user.email === RECIPIENT_EMAIL);
  if (!sender || !recipient) throw new Error('Seed kullanıcıları bulunamadı. Önce seed çalıştırılmalıdır.');

  const tenantId = identities.tenant.id;
  await runWithTenantScope(tenantId, async () => {
    const activeMemberships = await prisma.tenantUser.count({
      where: { tenantId, userId: { in: [sender.id, recipient.id] }, isActive: true },
    });
    if (activeMemberships !== 2) throw new Error('Gönderen ve alıcı aynı tenant içinde aktif üye olmalıdır.');

    const service = new ChatService(new PrismaChatRepository(prisma), new StoragePlanResolver(prisma));
    const senderContext = { tenantId, userId: sender.id };
    const recipientContext = { tenantId, userId: recipient.id };
    const conversation = await service.createDirect(senderContext, recipient.id);
    const unreadBefore = await service.getUnreadCount(recipientContext);
    const message = await service.sendMessage(senderContext, conversation.id, {
      clientMessageId: randomUUID(),
      content: TEST_MESSAGE,
      type: 'TEXT',
      attachmentIds: [],
      mentionUserIds: [],
    });
    const unreadAfter = await service.getUnreadCount(recipientContext);
    if (unreadAfter !== unreadBefore + 1) {
      throw new Error(`Okunmamış mesaj sayacı artmadı: önce=${unreadBefore}, sonra=${unreadAfter}`);
    }
    console.log(JSON.stringify({
      tenantId,
      conversationId: conversation.id,
      messageId: message.id,
      sender: sender.name,
      recipient: recipient.name,
      unreadBefore,
      unreadAfter,
    }, null, 2));
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Test mesajı gönderilemedi.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

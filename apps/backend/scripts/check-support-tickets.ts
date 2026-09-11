import { prisma } from '../src/lib/prisma.js';
import { runWithTenantIsolationBypass } from '../src/lib/tenant-isolation-context.js';
import {
  createTenantTicket,
  listTenantTickets,
  getTenantTicket,
  addTenantTicketMessage,
  closeTenantTicket,
  reopenTenantTicket,
  listAdminTickets,
  getAdminTicket,
  addAdminTicketMessage,
  updateAdminTicket,
} from '../src/modules/platform/support-tickets/support-ticket.service.js';

async function main(): Promise<void> {
  console.info('Testing Platform Support Tickets...');

  // 1. Fetch or create test tenant and user
  let tenantA = await prisma.tenant.findFirst({ where: { deletedAt: null } });
  if (!tenantA) {
    throw new Error('No tenant found in database for test.');
  }

  let userA = await prisma.user.findFirst({
    where: { isActive: true, deletedAt: null, tenants: { some: { tenantId: tenantA.id } } },
  });
  if (!userA) {
    userA = await prisma.user.findFirst({ where: { isActive: true, deletedAt: null } });
    if (!userA) throw new Error('No user found in database.');
  }

  let admin = await prisma.adminUser.findFirst({ where: { isActive: true } });
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: {
        email: 'test-support-admin@axonerp.com',
        name: 'Test Support Admin',
        password: 'dummy',
      },
    });
  }

  // 2. Tenant user creates a ticket
  console.info('- Testing ticket creation by Tenant user...');
  const createdTicket = await createTenantTicket(tenantA.id, userA.id, {
    title: 'E-Fatura Bağlantı Sorunu',
    description: 'Entegratör sunucusuna bağlanırken zaman aşımı hatası almaktayız.',
    category: 'TECHNICAL',
    priority: 'HIGH',
  });

  if (!createdTicket.ticketNumber.startsWith('TCK-')) {
    throw new Error(`Unexpected ticketNumber format: ${createdTicket.ticketNumber}`);
  }
  if (createdTicket.status !== 'OPEN') {
    throw new Error(`Expected status OPEN, got ${createdTicket.status}`);
  }
  if (createdTicket.messages.length !== 1) {
    throw new Error(`Expected 1 initial message, got ${createdTicket.messages.length}`);
  }
  console.info(`  ✓ Created ticket: ${createdTicket.ticketNumber} (ID: ${createdTicket.id})`);

  // 3. Tenant list
  console.info('- Testing tenant list...');
  const tenantTickets = await listTenantTickets(tenantA.id);
  const found = tenantTickets.find((t) => t.id === createdTicket.id);
  if (!found) throw new Error('Created ticket not found in tenant list');
  console.info(`  ✓ Ticket found in tenant tickets list (${tenantTickets.length} tickets)`);

  // Admin operations run with admin-console bypass
  await runWithTenantIsolationBypass('admin-console', async () => {
    // 4. Admin lists tickets
    console.info('- Testing admin list...');
    const adminTickets = await listAdminTickets({ status: 'OPEN' });
    if (!adminTickets.some((t) => t.id === createdTicket.id)) {
      throw new Error('Created ticket not found in admin tickets list');
    }
    console.info(`  ✓ Admin sees created ticket in OPEN queue`);

    // 5. Admin adds an internal note
    console.info('- Testing admin internal note...');
    const internalNote = await addAdminTicketMessage(admin.id, createdTicket.id, {
      message: 'GİB entegratör servisinde bakım çalışması var, durumu kontrol ediyoruz.',
      isInternal: true,
    });
    if (!internalNote.isInternal) throw new Error('Expected isInternal: true');

    // Verify tenant CANNOT see the internal note
    const tenantViewAfterNote = await getTenantTicket(tenantA.id, createdTicket.id);
    if (tenantViewAfterNote.messages.some((m) => m.isInternal)) {
      throw new Error('SECURITY BREACH: Tenant user can see internal admin note!');
    }
    if (tenantViewAfterNote.messages.length !== 1) {
      throw new Error(`Tenant should only see 1 message, got ${tenantViewAfterNote.messages.length}`);
    }
    console.info('  ✓ Tenant cannot see admin internal note (Security Isolation OK)');

    // 6. Admin adds a public reply
    console.info('- Testing admin public reply...');
    await addAdminTicketMessage(admin.id, createdTicket.id, {
      message: 'Merhaba, entegratör servisi kontrol edildi. Tekrar denemenizi rica ederiz.',
      isInternal: false,
    });

    const tenantViewAfterReply = await getTenantTicket(tenantA.id, createdTicket.id);
    if (tenantViewAfterReply.status !== 'WAITING_TENANT') {
      throw new Error(`Expected ticket status WAITING_TENANT, got ${tenantViewAfterReply.status}`);
    }
    if (tenantViewAfterReply.messages.length !== 2) {
      throw new Error(`Expected 2 visible messages for tenant, got ${tenantViewAfterReply.messages.length}`);
    }
    console.info('  ✓ Public reply received and status updated to WAITING_TENANT');

    // 7. Tenant user replies back
    console.info('- Testing tenant user reply...');
    await addTenantTicketMessage(tenantA.id, createdTicket.id, userA.id, {
      message: 'Teşekkürler, sorun çözüldü, faturalar iletildi.',
    });

    const tenantViewAfterUserReply = await getTenantTicket(tenantA.id, createdTicket.id);
    if (tenantViewAfterUserReply.status !== 'IN_PROGRESS') {
      throw new Error(`Expected ticket status IN_PROGRESS, got ${tenantViewAfterUserReply.status}`);
    }
    console.info('  ✓ Tenant reply received and status updated to IN_PROGRESS');

    // 8. Admin updates status to RESOLVED
    console.info('- Testing admin resolution...');
    const resolvedTicket = await updateAdminTicket(admin.id, createdTicket.id, {
      status: 'RESOLVED',
      assignedAdminId: admin.id,
    });
    if (resolvedTicket.status !== 'RESOLVED' || !resolvedTicket.resolvedAt) {
      throw new Error('Expected status RESOLVED with resolvedAt set');
    }
    console.info('  ✓ Ticket resolved by admin');

    // 9. Testing message rejection while ticket is RESOLVED (User cannot send message directly)
    console.info('- Testing message rejection on RESOLVED ticket...');
    try {
      await addTenantTicketMessage(tenantA.id, createdTicket.id, userA.id, {
        message: 'Direkt mesaj gönderilmemeli',
      });
      throw new Error('Expected validation error when adding message to resolved ticket');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Expected validation error')) throw err;
      console.info('  ✓ Message rejected on RESOLVED ticket as expected');
    }

    // 10. Tenant clicks "Çözüme Ulaşmadı" (Reopen)
    console.info('- Testing tenant "Çözüme Ulaşmadı" (reopen)...');
    const reopenedTicket = await reopenTenantTicket(tenantA.id, createdTicket.id, userA.id, 'Hata hala devam ediyor');
    if (reopenedTicket.status !== 'IN_PROGRESS' || reopenedTicket.resolvedAt !== null) {
      throw new Error('Expected ticket to return to IN_PROGRESS with resolvedAt cleared');
    }
    console.info('  ✓ Ticket successfully reopened and returned to IN_PROGRESS');

    // 11. Now tenant can send message again
    console.info('- Testing tenant message after reopen...');
    await addTenantTicketMessage(tenantA.id, createdTicket.id, userA.id, {
      message: 'Sorun halen 500 koduyla devam etmekte, lütfen inceleyin.',
    });
    console.info('  ✓ Tenant successfully sent message after reopen');

    // 12. Admin resolves again
    await updateAdminTicket(admin.id, createdTicket.id, { status: 'RESOLVED' });

    // 13. Tenant clicks "Çözüme Ulaştı" (Close)
    console.info('- Testing tenant "Çözüme Ulaştı" (ticket close)...');
    await closeTenantTicket(tenantA.id, createdTicket.id, userA.id);
    const closedTicket = await getTenantTicket(tenantA.id, createdTicket.id);
    if (closedTicket.status !== 'CLOSED' || !closedTicket.closedAt) {
      throw new Error('Expected status CLOSED with closedAt set');
    }
    console.info('  ✓ Ticket closed by user');

    // 14. Attempt to add message to closed ticket should fail
    console.info('- Testing message rejection on closed ticket...');
    try {
      await addTenantTicketMessage(tenantA.id, createdTicket.id, userA.id, {
        message: 'Bu mesaj gönderilmemeli',
      });
      throw new Error('Expected validation error when adding message to closed ticket');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Expected validation error')) throw err;
      console.info('  ✓ Message rejected on closed ticket as expected');
    }

    // Clean up test ticket
    await prisma.platformSupportTicket.delete({ where: { id: createdTicket.id } });
    console.info('  ✓ Test cleanup completed');
  });

  console.info('All Platform Support Ticket tests passed successfully! 🎉');
}

void main()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_TICKETS_${Date.now()}`;
type Session = { cookie: string };

async function api(session: Session | null, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug: slug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: 'STARTER', status: 'ACTIVE' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: 'STARTER', status: 'ACTIVE' } });
  try {
    await prisma.tenantUser.createMany({ data: [{ tenantId: tenantA.id, userId: owner.id, isOwner: true }, { tenantId: tenantB.id, userId: owner.id, isOwner: true }] });
    assert.equal((await api(null, '/api/support-tickets')).status, 401);
    let a = await login(owner.email, tenantA.slug);
    assert.equal((await api(a, '/api/support-tickets', 'POST', { title: 'x', description: 'short' })).status, 400);
    assert.equal((await api(a, '/api/support-tickets', 'POST', { title: 'Valid title', description: 'Valid description text', unexpected: true })).status, 400);
    assert.equal((await api(a, '/api/support-tickets?status=INVALID')).status, 400);

    const created = await api(a, '/api/support-tickets', 'POST', { title: `${marker} Türkçe Hata`, description: 'Üretim ekranında kontrollü test hatası oluşuyor.', category: 'TECHNICAL', priority: 'HIGH' });
    assert.equal(created.status, 201);
    const ticketId: string = created.body.data.id;
    assert.match(created.body.data.ticketNumber, /^TCK-\d{4}-\d{6}-\d{4}$/);
    assert.equal(created.body.data.status, 'OPEN');
    assert.equal(created.body.data.messages.length, 1);
    assert.equal(await prisma.platformSupportTicket.count({ where: { id: ticketId, tenantId: tenantA.id } }), 1);
    assert.equal(await prisma.platformTicketMessage.count({ where: { ticketId } }), 1);

    const filtered = await api(a, `/api/support-tickets?status=OPEN&category=TECHNICAL&search=${encodeURIComponent(marker)}`);
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data.length, 1);
    assert.equal(filtered.body.data[0].id, ticketId);
    assert.equal((await api(a, '/api/support-tickets?status=CLOSED')).body.data.length, 0);

    const reply = await api(a, `/api/support-tickets/${ticketId}/messages`, 'POST', { message: 'Ek bilgi: hata yalnız gece vardiyasında oluşuyor.' });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.data.ticketId, ticketId);
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/messages`, 'POST', { message: ' ' })).status, 400);
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/messages`, 'POST', { message: 'valid', isInternal: true })).status, 201);
    const tenantWritten = await prisma.platformTicketMessage.findFirstOrThrow({ where: { ticketId }, orderBy: { createdAt: 'desc' } });
    assert.equal(tenantWritten.isInternal, false);

    const b = await login(owner.email, tenantB.slug);
    assert.equal((await api(b, `/api/support-tickets/${ticketId}`)).status, 404);
    assert.equal((await api(b, `/api/support-tickets/${ticketId}/messages`, 'POST', { message: 'foreign write' })).status, 404);
    assert.equal((await api(b, `/api/support-tickets/${ticketId}/close`, 'POST')).status, 404);
    assert.equal((await api(b, '/api/support-tickets')).body.data.length, 0);

    a = await login(owner.email, tenantA.slug);
    const beforeClose = await prisma.platformTicketMessage.count({ where: { ticketId } });
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/close`, 'POST')).status, 200);
    const afterClose = await prisma.platformTicketMessage.count({ where: { ticketId } });
    assert.equal(afterClose, beforeClose + 1);
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/close`, 'POST')).status, 200);
    assert.equal(await prisma.platformTicketMessage.count({ where: { ticketId } }), afterClose);
    assert.equal((await prisma.platformSupportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status, 'CLOSED');
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/messages`, 'POST', { message: 'closed write' })).status, 400);
    assert.equal((await api(a, `/api/support-tickets/${ticketId}/reopen`, 'POST', { reason: 'closed reopen' })).status, 400);

    const second = await api(a, '/api/support-tickets', 'POST', { title: `${marker} Reopen`, description: 'Resolved lifecycle test description.', category: 'OTHER', priority: 'LOW' });
    assert.equal(second.status, 201);
    const secondId: string = second.body.data.id;
    assert.equal((await api(a, `/api/support-tickets/${secondId}/reopen`, 'POST', { reason: 'not resolved' })).status, 400);
    await prisma.platformSupportTicket.update({ where: { id: secondId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    assert.equal((await api(a, `/api/support-tickets/${secondId}/reopen`, 'POST', { reason: 'x'.repeat(2001) })).status, 400);
    const reopened = await api(a, `/api/support-tickets/${secondId}/reopen`, 'POST', { reason: 'Sorun devam ediyor' });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.data.status, 'IN_PROGRESS');
    assert.equal(reopened.body.data.resolvedAt, null);
    assert.equal(reopened.body.data.messages.some((message: { message: string }) => message.message.includes('Sorun devam ediyor')), true);
    assert.equal((await api(a, `/api/support-tickets/${secondId}/reopen`, 'POST', { reason: 'duplicate retry' })).status, 400);

    console.log(JSON.stringify({ marker, createReadSearch: 'PASS', messaging: 'PASS', closeIdempotency: 'PASS', reopenStateMachine: 'PASS', tenantIsolation: 'PASS', validation: 'PASS' }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });

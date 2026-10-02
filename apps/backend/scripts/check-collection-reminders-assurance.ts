import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient(), base = process.env.API_URL ?? 'http://localhost:3001', origin = 'http://localhost:3000';
const marker = `TEST_E2E_COLLECTION_${Date.now()}`;
type Session = { cookie: string };
async function login(email: string, tenantSlug: string): Promise<Session> { const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) }); assert.equal(r.status, 200); return { cookie: r.headers.get('set-cookie')!.split(';')[0] }; }
async function api(s: Session | null, path = '', method = 'GET', body?: unknown, raw?: string) { const r = await fetch(`${base}/api/collection-reminders${path}`, { method, headers: { origin, ...(s ? { cookie: s.cookie } : {}), ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }); return { status: r.status, body: await r.json().catch(() => null) as any }; }
async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: { slug, companyName: marker, email: `${slug}@test.local`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['ACCOUNTING', 'SALES'] } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  const contact = await prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: `${marker} Cari`, isActive: true } });
  const invoice = await prisma.invoice.create({ data: { tenantId: tenant.id, contactId: contact.id, type: 'SALES', status: 'SENT', number: `${marker}-INV`, date: new Date('2026-09-01'), dueDate: new Date('2026-10-02'), totalNet: 1000, totalGross: 1000 } });
  const cash = await prisma.cashAccount.create({ data: { tenantId: tenant.id, name: `${marker} Kasa` } });
  await prisma.fiscalPeriod.create({ data: { tenantId: tenant.id, name: marker, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } });
  return { tenant, contact, invoice, cash };
}
async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } }), a = await fixture(`${marker.toLowerCase()}-a`, admin.id), b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const sa = await login(admin.email, a.tenant.slug), sb = await login(admin.email, b.tenant.slug), denied = await login('depo@axondemo.com', 'axon-demo');
    assert.equal((await api(null)).status, 401); assert.equal((await api(denied)).status, 403);
    const valid = { invoiceId: a.invoice.id, contactId: a.contact.id, dueDate: '2026-10-02', remindAt: '2026-09-29', amount: 1000, notes: `${marker} Türkçe not ₺` };
    for (const bad of [{}, { ...valid, amount: 0 }, { ...valid, amount: -1 }, { ...valid, amount: 1000.001 }, { ...valid, amount: 1001 }, { ...valid, dueDate: 'bad' }, { ...valid, dueDate: '2026-10-03' }, { ...valid, remindAt: '2026-02-30' }, { ...valid, contactId: b.contact.id }, { ...valid, unexpected: true }, { ...valid, notes: 'x'.repeat(2001) }]) assert.equal((await api(sa, '', 'POST', bad)).status, 400);
    assert.equal((await api(sa, '', 'POST', { ...valid, invoiceId: b.invoice.id })).status, 404);
    assert.equal((await api(sa, '', 'POST', undefined, '{')).status, 400);
    const concurrent = await Promise.all([api(sa, '', 'POST', valid), api(sa, '', 'POST', valid)]);
    assert.equal(concurrent.filter((x) => x.status === 201).length, 1); assert.equal(concurrent.filter((x) => x.status === 409).length, 1);
    const id = concurrent.find((x) => x.status === 201)!.body.data.id;
    const stored = await prisma.collectionReminder.findUniqueOrThrow({ where: { id } });
    assert.equal(stored.tenantId, a.tenant.id); assert.equal(stored.contactId, a.contact.id); assert.equal(stored.dueDate.toISOString().slice(0, 10), '2026-10-02'); assert.equal(stored.remindAt.toISOString().slice(0, 10), '2026-09-29'); assert.equal(Number(stored.amount), 1000);
    const list = await api(sa); assert.equal(list.status, 200); assert.equal(list.body.data.some((x: any) => x.id === id), true); assert.equal(list.body.data.some((x: any) => x.tenantId === b.tenant.id), false);
    assert.equal((await api(sb, `/${id}/status`, 'PATCH', { status: 'SENT' })).status, 404); assert.equal((await api(sb, `/${id}`, 'DELETE')).status, 404);
    for (const body of [{}, { status: 'INVALID' }, { status: 'SENT', extra: true }, { status: 'SENT', notes: 'x'.repeat(2001) }]) assert.equal((await api(sa, `/${id}/status`, 'PATCH', body)).status, 400);
    assert.equal((await api(sa, `/${id}/status`, 'PATCH', { status: 'SENT', notes: `${marker} gönderildi` })).status, 200);
    assert.equal((await prisma.collectionReminder.findUniqueOrThrow({ where: { id } })).status, 'SENT');
    const payment = await fetch(`${base}/api/payments`, { method: 'POST', headers: { origin, cookie: sa.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ contactId: a.contact.id, cashAccountId: a.cash.id, date: '2026-10-02', amount: 1000, method: 'CASH', direction: 'RECEIVE', idempotencyKey: marker, allocations: [{ invoiceId: a.invoice.id, amount: 1000 }] }) });
    assert.equal(payment.status, 201); assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: a.invoice.id } })).status, 'PAID'); assert.equal((await prisma.collectionReminder.findUniqueOrThrow({ where: { id } })).status, 'CANCELLED');
    assert.equal((await api(sa, `/${id}`, 'DELETE')).status, 200); assert.equal(await prisma.collectionReminder.count({ where: { id } }), 0); assert.equal((await api(sa, `/${id}`, 'DELETE')).status, 404);
    const automation = await Promise.all([api(sb, '/automation/run', 'POST'), api(sb, '/automation/run', 'POST')]); assert.equal(automation.every((x) => x.status === 200), true);
    const automated = await prisma.collectionReminder.findMany({ where: { tenantId: b.tenant.id, invoiceId: b.invoice.id } });
    assert.equal(new Set(automated.map((x) => x.remindAt.toISOString())).size, automated.length);
    await assert.rejects(prisma.collectionReminder.create({ data: { tenantId: a.tenant.id, contactId: b.contact.id, invoiceId: b.invoice.id, amount: 1, dueDate: new Date(), remindAt: new Date() } }));
    console.log(JSON.stringify({ status: 'PASS', concurrentManual: concurrent.map((x) => x.status), concurrentAutomation: automation.map((x) => x.status), tenantIsolation: 'PASS', paymentClosure: 'PASS', dbCompositeFk: 'PASS' }));
  } finally { await prisma.tenant.deleteMany({ where: { id: { in: [a.tenant.id, b.tenant.id] } } }); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

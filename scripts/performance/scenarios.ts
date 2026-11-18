import { randomUUID } from 'node:crypto';
import type { PerformanceActor, PerformanceProfile } from '../../packages/types/src/performance.js';
import { entity, entityId, ScenarioFailure, WorkloadHTTP } from './http.js';

const reportYear = new Date().getUTCFullYear();
const readPaths = ['/api/products?limit=20', '/api/contacts?limit=20', `/api/reports/revenue-summary?dateFrom=${reportYear}-01-01&dateTo=${reportYear}-12-31`, '/api/dashboard/basic/executive'] as const;
export async function readScenario(http: WorkloadHTTP, actor: PerformanceActor, vu: number, iteration: number): Promise<void> {
  const path = readPaths[iteration % readPaths.length];
  await http.request(actor, vu, path.split('?')[0], path, 'read');
}
async function financialScenario(http: WorkloadHTTP, actor: PerformanceActor, vu: number): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const invoice = entity(await http.post(actor, vu, 'invoice.create', '/api/invoices', { contactId: actor.contactId, type: 'SALES', date,
    lines: [{ productId: actor.productId, description: 'Synthetic phase8 sale', quantity: 1, unitPrice: 100, taxRateId: actor.taxRateId }] }));
  if (typeof invoice.id !== 'string') throw new ScenarioFailure('Missing invoice identity.');
  const postingKey = randomUUID();
  await Promise.all([http.post(actor, vu, 'invoice.approve', `/api/invoices/${invoice.id}/approve`, { idempotencyKey: postingKey }, [200]), http.post(actor, vu, 'invoice.approve-replay', `/api/invoices/${invoice.id}/approve`, { idempotencyKey: postingKey }, [200])]);
  const payment = { date, contactId: actor.contactId, cashAccountId: actor.cashAccountId, amount: 120, direction: 'RECEIVE', method: 'CASH', idempotencyKey: randomUUID(), allocations: [{ invoiceId: invoice.id, amount: 120 }] };
  const results = await Promise.all([http.post(actor, vu, 'payment.create', '/api/payments', payment), http.post(actor, vu, 'payment.replay', '/api/payments', payment)]);
  if (entityId(results[0]) !== entityId(results[1])) { http.metrics.violations++; throw new ScenarioFailure('Duplicate payment effect.'); }
}
async function uploadScenario(http: WorkloadHTTP, actor: PerformanceActor, vu: number): Promise<void> {
  const form = new FormData(); form.set('file', new Blob(['phase8 synthetic upload\n'.repeat(44)], { type: 'text/plain' }), `phase8-${randomUUID()}.txt`);
  form.set('entityType', 'PRODUCT'); form.set('entityId', actor.productId);
  const id = entityId(await http.request(actor, vu, 'attachment.upload', '/api/attachments/upload', 'write', { method: 'POST', body: form }, [201]));
  await http.request(actor, vu, 'attachment.download', `/api/attachments/${id}/download`, 'read', {}, [200], true);
}
export async function messageScenario(http: WorkloadHTTP, actor: PerformanceActor, vu: number): Promise<void> {
  const clientMessageId = randomUUID(); const measuring = http.metrics.isMeasuring();
  if (measuring) http.metrics.messageProof.begin(clientMessageId, actor.tenantId, actor.conversationId);
  try {
    await http.post(actor, vu, 'chat.message', `/api/chat/conversations/${actor.conversationId}/messages`, { clientMessageId, content: 'Synthetic phase8 message' });
    if (measuring) http.metrics.messageProof.accept(clientMessageId);
  } catch (error) { http.metrics.messageProof.cancel(clientMessageId); throw error; }
}
async function writeScenario(http: WorkloadHTTP, actor: PerformanceActor, vu: number, iteration: number): Promise<void> {
  switch (iteration % 5) {
    case 0: await financialScenario(http, actor, vu); break;
    case 1: {
      const movement = { productId: actor.productId, warehouseId: actor.warehouseId, type: 'OUT', quantity: 1, unitCost: 40, idempotencyKey: randomUUID() };
      const results = await Promise.all([http.post(actor, vu, 'stock.out', '/api/stock/movements', movement), http.post(actor, vu, 'stock.replay', '/api/stock/movements', movement)]);
      if (entityId(results[0]) !== entityId(results[1])) { http.metrics.violations++; throw new ScenarioFailure('Duplicate stock effect.'); }
      break;
    }
    case 2: await http.post(actor, vu, 'order.create', '/api/sales-orders', { contactId: actor.contactId, date: new Date().toISOString().slice(0, 10), items: [{ productId: actor.productId, quantity: 1, unitPrice: 100 }] }); break;
    case 3: await uploadScenario(http, actor, vu); break;
    default: await messageScenario(http, actor, vu);
  }
}
export async function boundaryProbe(http: WorkloadHTTP, actor: PerformanceActor, foreign: PerformanceActor, vu: number): Promise<void> {
  await http.request(actor, vu, 'tenant.read-boundary', `/api/products/${foreign.productId}`, 'invariant', {}, [404]);
  await http.request(actor, vu, 'tenant.write-boundary', '/api/invoices', 'invariant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId: actor.contactId, type: 'SALES', date: new Date().toISOString().slice(0, 10), lines: [{ productId: foreign.productId, description: 'Must reject', quantity: 1, unitPrice: 100 }] }) }, [400]);
}
export async function scenario(profile: PerformanceProfile, http: WorkloadHTTP, actor: PerformanceActor, foreign: PerformanceActor, vu: number, iteration: number): Promise<void> {
  if (iteration % 20 === 0) await boundaryProbe(http, actor, foreign, vu);
  if (profile === 'read') await readScenario(http, actor, vu, iteration);
  else if (profile === 'write') await writeScenario(http, actor, vu, iteration);
  else if (profile === 'realtime') { if (iteration % 5 === 0) await messageScenario(http, actor, vu); else await http.request(actor, vu, 'chat.messages', `/api/chat/conversations/${actor.conversationId}/messages?limit=20`, 'read'); }
  else if ((vu + iteration) % 10 < 6) await readScenario(http, actor, vu, iteration);
  else if ((vu + iteration) % 10 < 9) await writeScenario(http, actor, vu, iteration);
  else await http.request(actor, vu, 'web.products', '/dashboard/products', 'web', {}, [200], true);
}

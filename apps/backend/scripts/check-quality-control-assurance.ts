import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getQualityControl } from '../src/modules/production/infrastructure/services/quality-control.service.js';

const prisma = new PrismaClient(); const baseUrl = process.env.API_URL ?? 'http://localhost:3001'; const origin = 'http://localhost:3000'; const marker = `TEST_E2E_QUALITY_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> { const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) }); assert.equal(response.status, 200); const body = await response.json() as any; return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id }; }
async function api(session: Session | null, query = '') { const response = await fetch(`${baseUrl}/api/production/quality-control${query}`, { headers: { origin, ...(session ? { cookie: session.cookie } : {}) } }); return { status: response.status, body: await response.json().catch(() => null) as any }; }

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo'); const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo'); const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const productIds: string[] = []; const workOrderIds: string[] = []; let workCenterId = '';
  try {
    assert.equal((await api(null)).status, 401); assert.equal((await api(unauthorized)).status, 403);
    for (const value of ['abc', '7abc', '7.5', '0', '6', '181', '999999999999999999999']) assert.equal((await api(owner, `?horizonDays=${value}`)).status, 400, value);
    assert.equal((await api(owner, '?horizonDays=7')).status, 200);
    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } }); const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const finished = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_FG`, name: `${marker} Mamul` } }); productIds.push(finished.id);
    const material = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_RM`, name: `${marker} Malzeme` } }); productIds.push(material.id);
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_WC`, name: marker, capacity: 8 } }); workCenterId = wc.id;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const completed = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_COMPLETE`, status: 'COMPLETED', plannedQty: 100, producedQty: 90, scrapQty: 10, scrapReason: 'TEST fire', startDate: today, endDate: today, items: { create: { tenantId: owner.tenantId, productId: material.id, requiredQty: 100, consumedQty: 100 } }, operations: { create: { tenantId: owner.tenantId, workCenterId: wc.id, name: 'Final', stepOrder: 1, status: 'COMPLETED', actualStartAt: today, actualEndAt: today } } } }); workOrderIds.push(completed.id);
    const shortage = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_SHORT`, status: 'IN_PROGRESS', plannedQty: 100, producedQty: 20, startDate: today, items: { create: { tenantId: owner.tenantId, productId: material.id, requiredQty: 100, consumedQty: 80 } }, operations: { create: { tenantId: owner.tenantId, workCenterId: wc.id, name: 'Run', stepOrder: 1, status: 'IN_PROGRESS', actualStartAt: today } } } }); workOrderIds.push(shortage.id);
    const paused = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_PAUSED`, status: 'PAUSED', plannedQty: 50, producedQty: 10, startDate: today } }); workOrderIds.push(paused.id);
    const exactMaterial = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_MAT100`, status: 'IN_PROGRESS', plannedQty: 1, producedQty: 0, startDate: today, items: { create: { tenantId: owner.tenantId, productId: material.id, requiredQty: 100, consumedQty: 100 } } } }); workOrderIds.push(exactMaterial.id);
    const overMaterial = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_MAT120`, status: 'IN_PROGRESS', plannedQty: 1, producedQty: 0, startDate: today, items: { create: { tenantId: owner.tenantId, productId: material.id, requiredQty: 100, consumedQty: 120 } } } }); workOrderIds.push(overMaterial.id);
    const zeroMaterial = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_MAT0`, status: 'IN_PROGRESS', plannedQty: 1, producedQty: 0, startDate: today, items: { create: { tenantId: owner.tenantId, productId: material.id, requiredQty: 0, consumedQty: 0 } } } }); workOrderIds.push(zeroMaterial.id);
    const physicalOverrun = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_OVER`, status: 'COMPLETED', plannedQty: 100, producedQty: 100, scrapQty: 10, startDate: today, endDate: today } }); workOrderIds.push(physicalOverrun.id);
    await prisma.task.create({ data: { tenantId: owner.tenantId, title: `${marker} CAPA`, detail: 'Türkçe düzeltici faaliyet', module: 'production', entityType: 'WORK_ORDER', entityId: shortage.id, source: `quality:${shortage.id}:${marker}`, priority: 'CRITICAL', status: 'IN_PROGRESS', dueAt: today } });

    const result = await getQualityControl(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    const completedForm = result.outputForms.find((row) => row.workOrderId === completed.id)!; assert.equal(completedForm.completionPct, 90); assert.equal(completedForm.status, 'blocked');
    const completedIssues = result.nonconformities.filter((row) => row.workOrderId === completed.id); assert.deepEqual(completedIssues.map((row) => row.type), ['scrap']); assert.equal(completedIssues[0]?.quantityImpact, 10); assert.equal(completedIssues[0]?.severity, 'critical');
    const completedQuarantine = result.quarantineStock.filter((row) => row.workOrderId === completed.id); assert.equal(completedQuarantine.length, 1); assert.equal(completedQuarantine[0]?.quantity, 10); assert.equal(completedQuarantine[0]?.status, 'blocked');
    const shortageIssue = result.nonconformities.find((row) => row.workOrderId === shortage.id && row.type === 'material_shortage')!; assert.equal(shortageIssue.quantityImpact, 20); assert.equal(shortageIssue.severity, 'critical');
    const pausedIssues = result.nonconformities.filter((row) => row.workOrderId === paused.id); assert.equal(pausedIssues.some((row) => row.type === 'paused_order'), true);
    for (const id of [exactMaterial.id, overMaterial.id, zeroMaterial.id]) { const item = result.inputForms.find((row) => row.workOrderId === id)!.checklist.find((row) => row.key === 'material_consumption')!; assert.equal(item.passed, true); }
    assert.equal(result.nonconformities.some((row) => [exactMaterial.id, overMaterial.id, zeroMaterial.id].includes(row.workOrderId) && row.type === 'material_shortage'), false);
    const overrunIssues = result.nonconformities.filter((row) => row.workOrderId === physicalOverrun.id); assert.deepEqual(overrunIssues.map((row) => row.type), ['scrap']); assert.equal(result.outputForms.find((row) => row.workOrderId === physicalOverrun.id)?.completionPct, 100);
    const action = result.correctiveActions.find((row) => row.workOrderId === shortage.id)!; assert.equal(action.source, 'task'); assert.equal(action.status, 'in_progress'); assert.equal(action.priority, 'critical');
    assert.equal(result.correctiveActions.filter((row) => row.workOrderId === shortage.id).length, 1, 'real CAPA suppresses duplicate suggestion');
    assert.equal(result.summary.quarantineQuantity >= 70, true); assert.equal(result.acceptanceCriteria.every((row) => row.totalCount === row.passedCount + row.failedCount), true);

    const bulkRows = Array.from({ length: 130 }, (_, index) => ({
      tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BULK_${String(index).padStart(3, '0')}`,
      status: index >= 125 ? 'PAUSED' as const : 'COMPLETED' as const, plannedQty: 100,
      producedQty: index < 100 ? 100 : index < 115 ? 90 : index < 125 ? 80 : 10,
      scrapQty: index < 100 || index >= 125 ? 0 : 10, scrapReason: index >= 100 && index < 125 ? 'BULK fire' : null,
      startDate: today, endDate: index >= 125 ? null : today,
      updatedAt: new Date(today.getTime() + (130 - index) * 1000),
    }));
    await prisma.workOrder.createMany({ data: bulkRows });
    const bulkResult = await getQualityControl(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    const bulkOutputForms = bulkResult.outputForms.filter((row) => row.workOrderNumber.startsWith(`${marker}_BULK_`));
    const bulkIssues = bulkResult.nonconformities.filter((row) => row.workOrderNumber.startsWith(`${marker}_BULK_`));
    const bulkQuarantine = bulkResult.quarantineStock.filter((row) => row.workOrderNumber.startsWith(`${marker}_BULK_`));
    assert.equal(bulkOutputForms.length, 130, 'aggregate must include records beyond the newest 100');
    assert.equal(bulkIssues.length, 40); assert.equal(bulkIssues.filter((row) => row.type === 'scrap').length, 25); assert.equal(bulkIssues.filter((row) => row.type === 'under_production').length, 10); assert.equal(bulkIssues.filter((row) => row.type === 'paused_order').length, 5);
    assert.equal(bulkQuarantine.reduce((sum, row) => sum + row.quantity, 0), 800);

    const day6End = new Date(today); day6End.setUTCDate(day6End.getUTCDate() + 6); day6End.setUTCHours(23, 59, 59, 999); const outside = new Date(day6End.getTime() + 1);
    await prisma.workOrder.createMany({ data: [
      { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BOUNDARY_START`, status: 'COMPLETED', plannedQty: 1, producedQty: 1, startDate: today, endDate: today, updatedAt: new Date('2000-01-01') },
      { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BOUNDARY_END`, status: 'COMPLETED', plannedQty: 1, producedQty: 1, startDate: day6End, endDate: day6End, updatedAt: new Date('2000-01-01') },
      { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BOUNDARY_OUT`, status: 'COMPLETED', plannedQty: 1, producedQty: 1, startDate: outside, endDate: outside, updatedAt: new Date('2000-01-01') },
    ] });
    const boundary = await getQualityControl(prisma, { tenantId: owner.tenantId, horizonDays: 7 }); const boundaryNumbers = boundary.outputForms.map((row) => row.workOrderNumber); assert.equal(boundaryNumbers.includes(`${marker}_BOUNDARY_START`), true); assert.equal(boundaryNumbers.includes(`${marker}_BOUNDARY_END`), true); assert.equal(boundaryNumbers.includes(`${marker}_BOUNDARY_OUT`), false);
    const day179End = new Date(today); day179End.setUTCDate(day179End.getUTCDate() + 179); day179End.setUTCHours(23, 59, 59, 999); const outside180 = new Date(day179End.getTime() + 1);
    await prisma.workOrder.createMany({ data: [
      { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BOUNDARY_180_END`, status: 'COMPLETED', plannedQty: 1, producedQty: 1, startDate: day179End, endDate: day179End, updatedAt: new Date('2000-01-01') },
      { tenantId: owner.tenantId, productId: finished.id, number: `${marker}_BOUNDARY_180_OUT`, status: 'COMPLETED', plannedQty: 1, producedQty: 1, startDate: outside180, endDate: outside180, updatedAt: new Date('2000-01-01') },
    ] });
    const boundary180 = await getQualityControl(prisma, { tenantId: owner.tenantId, horizonDays: 180 }); const boundary180Numbers = boundary180.outputForms.map((row) => row.workOrderNumber); assert.equal(boundary180Numbers.includes(`${marker}_BOUNDARY_180_END`), true); assert.equal(boundary180Numbers.includes(`${marker}_BOUNDARY_180_OUT`), false);
    const foreignResult = await getQualityControl(prisma, { tenantId: foreign.tenantId, horizonDays: 7 }); assert.equal(foreignResult.inputForms.some((row) => workOrderIds.includes(row.workOrderId)), false); assert.equal(foreignResult.outputForms.some((row) => workOrderIds.includes(row.workOrderId)), false); assert.equal(foreignResult.nonconformities.some((row) => workOrderIds.includes(row.workOrderId)), false);
    console.log('PASS quality control assurance: auth, strict validation, forms, checklist, scrap/shortage semantics, quarantine, CAPA, acceptance math and tenant isolation');
  } finally {
    await prisma.task.deleteMany({ where: { tenantId: owner.tenantId, title: { startsWith: marker } } }); await prisma.workOrder.deleteMany({ where: { tenantId: owner.tenantId, number: { startsWith: marker } } }); if (workCenterId) await prisma.workCenter.deleteMany({ where: { id: workCenterId } }); await prisma.product.deleteMany({ where: { id: { in: productIds } } }); await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

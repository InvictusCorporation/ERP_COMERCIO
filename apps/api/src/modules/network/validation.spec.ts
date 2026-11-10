import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { transferInput, transitionInput, centralInput, distributeInput } from './validation';
const a = randomUUID(), b = randomUUID(), p = randomUUID();
const tr = { sourceId: a, destinationId: b, items: [{ productId: p, quantity: '1.125' }], reason: 'Reposição conferida', notes: '', requestKey: randomUUID() };
test('transferência exige pontas distintas, produtos únicos e precisão de três casas', () => { assert.equal(transferInput(tr).items[0]!.quantity, '1.125'); for (const x of [{ destinationId: a }, { items: [] }, { items: [...tr.items, ...tr.items] }, { items: [{ productId: p, quantity: '1.0001' }] }, { totalCost: '1' }, { tenantId: randomUUID() }])
    assert.throws(() => transferInput({ ...tr, ...x })); });
test('expedição exige documento e operação válida sem aceitar custo pelo cliente', () => { const x = { id: randomUUID(), version: 1, action: 'dispatch', reason: 'Conferência física', documentRef: 'DOC-01', requestKey: randomUUID() }; assert.equal(transitionInput(x).documentRef, 'DOC-01'); for (const v of [{ documentRef: '' }, { action: 'reverse' }, { cost: '1' }, { version: 0 }, { items: [] }])
    assert.throws(() => transitionInput({ ...x, ...v })); });
test('conferência exige linhas únicas e quantidade positiva', () => { const x = { id: randomUUID(), version: 3, action: 'receive', reason: 'Conferência física', items: [{ lineId: p, quantity: '1.125' }], requestKey: randomUUID() }; assert.equal(transitionInput(x).items![0]!.quantity, '1.125'); for (const items of [[], [...x.items, ...x.items], [{ lineId: p, quantity: '0' }], [{ lineId: p, quantity: '-1' }]])
    assert.throws(() => transitionInput({ ...x, items })); });
test('compra central agrupa produtos e limita destinações sem duplicar unidade', () => { const x = { unitId: a, supplierId: b, items: [{ productId: p, unitCost: '3.123456', allocations: [{ unitId: b, quantity: '2' }] }], freight: '0', extraCost: '0', discount: '0', expectedDate: '2026-11-10', notes: '', requestKey: randomUUID() }; assert.equal(centralInput(x).items[0]!.unitCost, '3.123456'); for (const v of [{ items: [...x.items, ...x.items] }, { items: [{ ...x.items[0], allocations: [...x.items[0]!.allocations, ...x.items[0]!.allocations] }] }, { expectedDate: '2026-02-30' }, { distributed: true }])
    assert.throws(() => centralInput({ ...x, ...v })); });
test('distribuição exige motivo, confirmação e não recebe destinos inventados', () => { const x = { id: a, reason: 'Distribuição conferida', requestKey: randomUUID() }; assert.equal(distributeInput(x).id, a); assert.throws(() => distributeInput({ ...x, transfers: [] })); assert.throws(() => distributeInput({ ...x, reason: 'x' })); });

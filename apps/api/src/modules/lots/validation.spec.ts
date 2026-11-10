import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lotInput } from './validation';
const draft = { unitId: randomUUID(), productId: randomUUID(), action: 'allocate', quantity: '1.125', code: 'l-2026', manufacturedOn: '2026-11-01', expiresOn: '2026-12-01', reason: 'Conferência de teste', alertDays: 30, requestKey: randomUUID() };
test('lotes validam calendário, precisão e identidade sem permitir saldo forjado', () => {
    assert.equal(lotInput(draft).code, 'L-2026');
    for (const extra of [{ expiresOn: '2026-02-30' }, { expiresOn: '' }, { manufacturedOn: '2027-01-01' }, { quantity: '1.0001' }, { quantity: '-1' }, { code: '<script>' }, { quantityAfter: '999' }, { blocked: true }, { reason: 'x' }, { alertDays: 0 }, { alertDays: 366 }])
        assert.throws(() => lotInput({ ...draft, ...extra }));
});
test('operações exigem lote e versão, categoria de perda e movimento original de estorno', () => {
    const lotId = randomUUID();
    for (const v of [{ ...draft, action: 'loss' }, { ...draft, action: 'loss', lotId, version: 1, lossKind: 'invalid' }, { ...draft, action: 'loss', lotId, lossKind: 'damage' }, { ...draft, action: 'reverse', lotId, version: 1, movementId: '' }, { ...draft, action: 'settings', lotId, version: 1 }])
        assert.throws(() => lotInput(v));
    assert.equal(lotInput({ ...draft, action: 'loss', lotId, version: 1, lossKind: 'damage' }).lossKind, 'damage');
    assert.equal(lotInput({ ...draft, action: 'reverse', lotId, version: 1, movementId: randomUUID() }).quantity, '');
});
test('configuração respeita limite de alerta e recusa estados arbitrários', () => { assert.equal(lotInput({ ...draft, action: 'settings', version: 2, alertDays: 365 }).alertDays, 365); assert.throws(() => lotInput({ ...draft, action: 'settings', tracking: false })); assert.throws(() => lotInput({ ...draft, action: 'allocate', expiresOn: '0000-01-01' })); });

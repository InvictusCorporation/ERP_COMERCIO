import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { accountInput, titleInput, settlementInput, requiredDate } from './validation';
test('financeiro recusa saldo forjado, conta inativa inicial e precisão monetária indevida', () => {
    const a = {
        unitId: randomUUID(), name: 'Caixa', kind: 'cash', openingDate: '2026-11-09', openingAmount: '100', active: true, requestKey: randomUUID()
    };
    assert.equal(accountInput(a).openingAmount, '100');
    for (const x of [{
            ...a, balance: '900'
        }, {
            ...a, active: false
        }, {
            ...a, openingAmount: '1.001'
        }, {
            ...a, openingDate: '2026-02-30'
        }])
        assert.throws(() => accountInput(x));
});
test('títulos validam calendário, campos imutáveis e limites de parcelas', () => {
    const t = {
        unitId: randomUUID(), kind: 'payable', counterparty: 'Fornecedor', description: 'Compra', issueDate: '2026-11-09', dueDate: '2026-12-09', amount: '100.01', installments: 3, intervalDays: 30, requestKey: randomUUID()
    };
    assert.equal(titleInput(t).installments, 3);
    for (const x of [{
            ...t, installments: 37
        }, {
            ...t, amount: '0'
        }, {
            ...t, paid: '100'
        }, {
            ...t, intervalDays: 0
        }, {
            ...t, kind: 'forged'
        }, {
            ...t, dueDate: '9999-12-31', installments: 2
        }, {
            ...t, dueDate: '2026-01-01'
        }])
        assert.throws(() => titleInput(x));
    assert.throws(() => requiredDate(''));
});
test('baixa preserva texto monetário e recusa valores ou dados de cartão indevidos', () => {
    const s = {
        titleId: randomUUID(), version: 1, accountId: randomUUID(), principal: '40', interest: '2', fee: '1', discount: '3', postedDate: '2026-11-09', method: 'pix', requestKey: randomUUID()
    };
    assert.equal(settlementInput(s).principal, '40');
    for (const x of [{
            ...s, principal: '-1'
        }, {
            ...s, interest: '1.001'
        }, {
            ...s, cardNumber: '1234'
        }, {
            ...s, method: 'bank-provider'
        }, {
            ...s, version: '1'
        }])
        assert.throws(() => settlementInput(x));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { saveInput, paymentInput } from './validation';
import { sandboxEnabled } from './pos.service';
test('PDV recusa itens duplicados, precisão inválida e dados de cartão', () => { const item = { productId: randomUUID(), quantity: '0.125', expectedPrice: '5.00' }, input = { registerId: randomUUID(), items: [item], discount: '0', notes: '', requestKey: randomUUID() }; assert.equal(saveInput(input).items[0]?.quantity, '0.125'); for (const items of [[], [item, item], [{ ...item, quantity: '0.0001' }], [{ ...item, expectedPrice: '5.001' }]])
    assert.throws(() => saveInput({ ...input, items })); assert.throws(() => saveInput({ ...input, unitPrice: '0.01' })); });
test('formas distintas e dinheiro com precisão monetária', () => { const method = { method: 'cash', amount: '10.00', tendered: '20.00' }, input = { saleId: randomUUID(), version: 1, methods: [method], requestKey: randomUUID() }; assert.equal(paymentInput(input).methods[0]?.tendered, '20.00'); for (const methods of [[method, method], [{ ...method, cardNumber: '1234' }], [{ ...method, amount: '1.001' }], [{ ...method, method: 'bank' }]])
    assert.throws(() => paymentInput({ ...input, methods })); });
test('pagamento sandbox nunca é habilitado em produção', () => { assert.equal(sandboxEnabled({ origin: 'http://127.0.0.1:3000' }, 'test'), true); assert.equal(sandboxEnabled({ origin: 'https://erp.example.invalid' }, 'test'), false); assert.equal(sandboxEnabled({ origin: 'https://erp.example.invalid', posSandbox: true }, 'development'), true); assert.equal(sandboxEnabled({ origin: 'http://localhost:3000', posSandbox: true }, 'production'), false); assert.equal(sandboxEnabled({ origin: 'http://localhost:3000', posSandbox: false }, 'test'), false); });

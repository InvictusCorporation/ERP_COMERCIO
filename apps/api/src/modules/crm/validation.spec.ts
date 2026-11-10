import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validCpf, customerInput, orderInput, loyaltyInput, creditInput, deliveryAction } from './validation';
const unitId = randomUUID(), customerId = randomUUID(), requestKey = randomUUID(), address = { street: 'Rua de teste', number: '1', city: 'Fortaleza', state: 'CE', postalCode: '60000-000' };
const customer = { unitId, name: 'Cliente de teste', document: '529.982.247-25', phone: '', email: '', address, notes: '', active: true, loyaltyOptIn: false, requestKey };
test('CPF usa os dois dígitos verificadores e rejeita repetições', () => { assert.equal(validCpf('52998224725'), true); for (const v of ['11111111111', '52998224724', '5299822472', ''])
    assert.equal(validCpf(v), false); assert.equal(customerInput(customer).document, '52998224725'); assert.equal(customerInput({ ...customer, document: '' }).document, ''); });
test('cliente valida contato opcional e endereço sem campos ocultos', () => { for (const patch of [{ email: 'inválido' }, { phone: 'mensagem arbitrária' }, {phone:'.........'}, { address: { ...address, state: 'XX' } }, { address: { ...address, postalCode: '123' } }, { tenantId: unitId }, { points: '100' }, { active: 'true' }])
    assert.throws(() => customerInput({ ...customer, ...patch })); });
const order = { unitId, customerId, mode: 'delivery', channel: 'mobile', payment: 'credit', items: [{ productId: randomUUID(), quantity: '1.125', expectedPrice: '3.50' }], address, deliveryFee: '2', dueDate: '2026-11-10', installments: 3, intervalDays: 30, notes: '', requestKey };
test('pedido preserva precisão de peso e recusa totais, custo e linhas duplicadas', () => { assert.equal(orderInput(order).items[0]!.quantity, '1.125'); for (const patch of [{ items: [...order.items, ...order.items] }, { items: [{ ...order.items[0], quantity: '1.0001' }] }, { total: '1' }, { items: [{ ...order.items[0], cost: '0.01' }] }, { mode: 'pickup' }, { installments: 37 }, { intervalDays: 0 }, { dueDate: '2026-02-30' }, { address: { ...address, street: '' } }])
    assert.throws(() => orderInput({ ...order, ...patch })); });
test('movimentos de fidelidade são inteiros, assinados somente para ajuste e sem compra inventada', () => { const b = { customerId, kind: 'adjust', points: '-10', reason: 'Ajuste conferido', requestKey }; assert.equal(loyaltyInput(b).points, '-10'); for (const patch of [{ kind: 'earn' }, { points: '1.5' }, { points: '0' }, { points: '1000000000' }, { kind: 'redeem' }, { orderId: randomUUID() }])
    assert.throws(() => loyaltyInput({ ...b, ...patch })); });
test('limite aprovado e confirmação de entrega exigem dados explícitos', () => { assert.throws(() => creditInput({ customerId, limit: '1.001', enabled: true, reason: 'Teste' })); assert.throws(() => deliveryAction({ id: randomUUID(), version: 1, action: 'delivered', recipient: '', reason: 'Recebimento', requestKey })); assert.throws(() => deliveryAction({ id: randomUUID(), version: 1, action: 'assigned', courier: '', reason: 'Designação', requestKey })); });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { quantityMilli, quantityText, weighedTotal, internalWeightCode, ean13Pattern } from '@invictus/contracts';
import { weighInput, recipeInput, scaleInput, runInput } from './validation';
import { saveInput } from '../pos/validation';
test('pesos em gramas e centavos evitam erros de ponto flutuante', () => { assert.equal(quantityText(quantityMilli('0.125') + quantityMilli('0.200')), '0.325'); assert.equal(quantityText(10000n), '10'); assert.equal(quantityText(100n), '0.1'); assert.equal(weighedTotal('0.125', '26.90'), '3.36'); assert.equal(weighedTotal('0.005', '1'), '0.01'); for (const q of ['-1', '1.0001', 'NaN', '1e3', ''])
    assert.throws(() => quantityMilli(q)); });
test('etiqueta interna tem prefixo, PLU, gramas e DV válidos', () => { const code = internalWeightCode('20', '00001', '0.5'); assert.equal(code, '2000001005002'); assert.equal(ean13Pattern(code).length, 95); assert.equal(ean13Pattern('4006381333931').slice(0, 10), '1010001101'); for (const input of [['19', '00001', '1'], ['20', '00000', '1'], ['20', '00001', '100'], ['20', '00001', '0']])
    assert.throws(() => internalWeightCode(...input as [
        string,
        string,
        string
    ])); assert.throws(() => ean13Pattern(code.slice(0, 12) + '0')); });
test('pesagem exige estabilidade, tara menor que bruto e precisão de três casas', () => { const input = { unitId: randomUUID(), scaleId: randomUUID(), productId: randomUUID(), gross: '0.520', tare: '0.020', stable: true, requestKey: randomUUID() }; assert.equal(weighInput(input).gross, '0.520'); for (const extra of [{ stable: false }, { gross: '0.0001' }, { tare: '0.520' }, { net: '0.5' }, { price: '1' }])
    assert.throws(() => weighInput({ ...input, ...extra })); });
test('balanças aceitam somente formato interno explícito e capacidade conferida', () => { const b = { unitId: randomUUID(), name: 'Balança', model: '', mode: 'ean13_weight', prefix: '20', capacity: '15', resolution: '0.005', active: true, reviewed: true }; assert.equal(scaleInput(b).mode, 'ean13_weight'); for (const x of [{ prefix: '99' }, { capacity: '100' }, { resolution: '0' }, { mode: 'serial' }, { resolution: '1', capacity: '0.5' }])
    assert.throws(() => scaleInput({ ...b, ...x })); });
test('fichas recusam autorreferência, duplicatas e valores de custo enviados pelo cliente', () => { const id = randomUUID(), input = { unitId: randomUUID(), sectorId: randomUUID(), name: 'Pão', outputProductId: id, yieldQuantity: '2', ingredients: [{ productId: randomUUID(), quantity: '1' }], notes: '', active: true, reviewed: true }; assert.equal(recipeInput(input).ingredients.length, 1); for (const x of [{ ingredients: [{ productId: id, quantity: '1' }] }, { ingredients: [...input.ingredients, ...input.ingredients] }, { totalCost: '1' }])
    assert.throws(() => recipeInput({ ...input, ...x })); const r = { unitId: randomUUID(), recipeId: randomUUID(), recipeVersion: 1, factor: '1', actualQuantity: '2', lotCode: 'LOTE', expiresOn: '2027-01-01', reason: 'Produção teste', requestKey: randomUUID() }; assert.throws(() => runInput({ ...r, expiresOn: '2027-02-30' })); assert.throws(() => runInput({ ...r, actualQuantity: '1.0001' })); });
test('PDV aceita pesagens agrupadas sem permitir origens e bruto/tara ambíguos', () => { const b = { registerId: randomUUID(), items: [{ productId: randomUUID(), quantity: '0.325', expectedPrice: '10', measurement: { source: 'combined', parts: [{ source: 'manual', gross: '0.145', tare: '0.020' }, { source: 'label', barcode: internalWeightCode('20', '00001', '0.2') }] } }], discount: '0', notes: '', requestKey: randomUUID() }; assert.equal(saveInput(b).items[0]!.measurement!.source, 'combined'); for (const m of [{ source: 'serial', gross: '1', tare: '0' }, { source: 'manual', gross: '1', tare: '0', barcode: '123' }, { source: 'combined', parts: [] }, { source: 'combined', parts: [{ source: 'combined', parts: [] }] }])
    assert.throws(() => saveInput({ ...b, items: [{ ...b.items[0], measurement: m }] })); });

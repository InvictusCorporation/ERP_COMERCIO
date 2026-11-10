import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { filters, validateDimensions, kind } from './validation';
import { csv, CSV_LIMIT, CSV_BYTES } from './csv';
test('período exige datas reais, duas pontas e até 367 dias', () => { assert.equal(filters({ from: '2024-02-29', to: '2025-03-01' }).from, '2024-02-29'); for (const v of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-01-01' }, { from: '2026-03-01', to: '2026-01-01' }, { from: '2020-01-01', to: '2026-01-01' }])
    assert.throws(() => filters(v)); });
test('filtros não recebem tenant, SQL, colunas ou origem arbitrária', () => { for (const v of [{ tenantId: randomUUID() }, { source: 'real' }, { status: 'closed' }, { page: '-1' }, { unitId: 'x' }, { columns: ['document'] }, { sql: 'SELECT 1' }])
    assert.throws(() => filters(v)); assert.throws(() => kind('invoices')); assert.throws(() => filters({ kind: 'stock', page: '1' }, { export: true })); });
test('dimensões por módulo não geram seleção silenciosamente incompatível', () => { assert.throws(() => validateDimensions('cashflow', { category: 'Mercearia' })); assert.throws(() => validateDimensions('transactions', { supplierId: randomUUID() })); assert.throws(() => validateDimensions('losses', { status: 'missing' })); assert.doesNotThrow(() => validateDimensions('stock', { status: 'near_expiry' })); });
test('CSV protege fórmulas, mantém negativos numéricos e seis casas de custo', () => { const output = csv([{ key: 'name', label: 'Produto', type: 'text' }, { key: 'cost', label: 'Custo', type: 'money' }], [{ name: ' =HYPERLINK("exemplo")', cost: '-1.123456' }, { name: 'Acme; "A"', cost: '0' }]); assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('"\' =HYPERLINK(""exemplo"")"')); assert.ok(output.includes('"-1,123456"')); assert.ok(output.includes('"Acme; ""A"""')); for (const name of ['+1', '-cmd', '@SUM(A1)', '\t=2', '\r=2'])
    assert.ok(csv([{ key: 'name', label: 'Nome', type: 'text' }], [{ name }]).includes("'" + name)); });
test('CSV não trunca, não aceita não número em coluna numérica e permite arquivo vazio', () => { assert.throws(() => csv([{ key: 'v', label: 'Valor', type: 'money' }], [{ v: '=1' }])); assert.throws(() => csv([], Array.from({ length: CSV_LIMIT + 1 }, () => ({})))); assert.equal(csv([{ key: 'v', label: 'Valor', type: 'text' }], []), '\uFEFF"Valor"\r\n\r\n'); });
test('CSV mede bytes UTF-8 e recusa arquivo excessivo sem entregar parte dele', () => { assert.throws(() => csv([{ key: 'name', label: 'Nome', type: 'text' }], [{ name: '€'.repeat(Math.ceil(CSV_BYTES / 3)) }]), (e: unknown) => e instanceof Error && e.message.includes('8 MB')); });

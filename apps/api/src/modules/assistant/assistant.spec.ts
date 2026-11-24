import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { draftInput } from './validation';
import { DisabledManagementAssistant } from './assistant.gateway';

const input = { topic: 'stock', unitId: randomUUID(), from: '2026-11-01', to: '2026-11-10', question: 'Quais produtos precisam de reposição?' };
test('pergunta gerencial valida tema, filial, datas, tamanho e campos de autoridade', () => {
  assert.equal(draftInput(input).topic, 'stock');
  for (const extra of [{ topic: '__proto__' }, { topic: 'constructor' }, { topic: 'execute_sql' }, { unitId: 'x' }, { from: '2026-02-30' }, { from: '2026-11-11' }, { from: '2020-01-01' }, { to: '' }, { question: '  ' }, { question: 'x'.repeat(2001) }, { question: 'Texto\x00 proibido' }, { tenantId: randomUUID() }, { execute: true }, { model: 'external' }, { role: 'master' }])
    assert.throws(() => draftInput({ ...input, ...extra }));
  assert.equal(draftInput({ ...input, question: '  Analisar vendas\npor período  ' }).question, 'Analisar vendas\npor período');
});
test('adaptador de IA desativado não gera respostas nem executa ações', async () => {
  const draft = { ...draftInput(input), state: 'draft' as const, generatedAnswer: null, sentToProvider: false as const, unitName: 'Filial teste', companyName: 'Empresa teste', preparedAt: '2026-11-10T12:00:00Z' };
  await assert.rejects(new DisabledManagementAssistant().analyze({ tenantId: randomUUID(), draft }), ServiceUnavailableException);
});

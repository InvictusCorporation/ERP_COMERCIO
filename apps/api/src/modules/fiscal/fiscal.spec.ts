import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FocusGateway, validAccessKey, safeAssetPath, type GatewayDocument } from './focus.gateway';
import { taxValue, cents, prepareFiscal } from './prepare';
import { issuerInput, productInput, draftInput, validCpf, justification } from './validation';
const d: GatewayDocument = { tenantId: randomUUID(), unitId: randomUUID(), issuerCnpj: '11222333000181', reference: 'INV-' + randomUUID(), model: '65', key: null, protocol: null };
const token = 'synthetic-only-unit-test-token';
const env = { NODE_ENV: 'test', FISCAL_PROVIDER: 'focus_homologation', FISCAL_FOCUS_HOMOLOG_TOKENS: JSON.stringify({ [d.tenantId + '/' + d.unitId + '/' + d.issuerCnpj]: token }) };
const profile = { ncm: '10063021', cest: '', cfop: '5102', origin: '0', icmsCode: '102', icmsRate: '0', pisCode: '07', pisRate: '0', cofinsCode: '07', cofinsRate: '0', rtc: 'not_applicable', ibsCode: '', classification: '', ibsStateRate: '0', ibsCityRate: '0', cbsRate: '0', reviewed: true };
const issuer = { uf: 'CE', crt: '1', ie: '123456789', municipalityCode: '2304400', city: 'Fortaleza', street: 'Rua fictícia', number: '1', district: 'Centro', postalCode: '60000000', reviewed: true };
const recipient = { name: '', document: '', ieIndicator: '9', ie: '', uf: '', municipalityCode: '', city: '', street: '', number: '', district: '', postalCode: '' };
function key() {
    const prefix = '232611' + d.issuerCnpj + '65001000000001112345678';
    let sum = 0, w = 2;
    for (let i = 42; i >= 0; i--) {
        sum += Number(prefix[i]) * w;
        w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    return prefix + (r < 2 ? '0' : 11 - r);
}
const response = (extra: Record<string, unknown> = {}) => ({ ref: d.reference, cnpj_emitente: d.issuerCnpj, status: 'autorizado', chave_nfe: key(), status_sefaz: '100', protocolo_nota_fiscal: { ambiente: '2', chave_nfe: key(), numero_protocolo: '123456789012345', status: '100' }, ...extra });
const gateway = (fn: typeof fetch) => new FocusGateway(env, fn);
test('fiscal calcula tributos em centavos com meia unidade para cima e quatro casas na taxa', () => { assert.equal(taxValue('0.05', '10'), '0.01'); assert.equal(taxValue('123.45', '1.6500'), '2.04'); assert.equal(taxValue('0.01', '0.1000'), '0.00'); assert.equal(taxValue('999999999.99', '100'), '999999999.99'); assert.equal(cents('1.01'), 101n); });
test('fiscal valida CPF, códigos, revisão e bases sem aceitar autorização forjada', () => {
    assert.ok(validCpf('11144477735'));
    assert.equal(validCpf('11111111111'), false);
    assert.equal(validCpf('11144477734'), false);
    assert.equal(issuerInput({ unitId: d.unitId, data: issuer }).data.reviewed, true);
    assert.equal(productInput({ unitId: d.unitId, productId: randomUUID(), data: profile }).data.ncm, '10063021');
    for (const patch of [{ ncm: '123' }, { cfop: '6102' }, { icmsRate: '1' }, { pisRate: '0.00001' }, { rtc: 'standard', ibsCode: '000', classification: '123' }, { classification: '000001' }, { reviewed: 'true' }])
        assert.throws(() => productInput({ unitId: d.unitId, productId: randomUUID(), data: { ...profile, ...patch } }));
    const form = { saleId: randomUUID(), model: '65', nature: 'Venda teste', recipient, bases: [], additional: '', requestKey: randomUUID() };
    assert.throws(() => draftInput({ ...form, protocol: 'forjado' }));
    const p = randomUUID();
    assert.throws(() => draftInput({ ...form, bases: [{ productId: p }, { productId: p }] }));
    assert.throws(() => justification('curta'));
});
test('fiscal mantém base tributária explícita e snapshot da venda sem inventar emissão', () => { const productId = randomUUID(); const form = draftInput({ saleId: randomUUID(), model: '55', nature: 'Venda de teste', recipient, bases: [], additional: '', requestKey: randomUUID() }); const sale = { number: 'TEST', sandbox: true, gross: '5.00', discount: '0.00', total: '5.00', items: [{ id: randomUUID(), productId, code: 'TEST', name: 'Produto teste', baseUnit: 'UN', quantity: '1', unitPrice: '5.00', gross: '5.00', discount: '0.00', total: '5.00' }] }; const p = productInput({ unitId: d.unitId, productId, data: { ...profile, icmsCode: '00', icmsRate: '18' } }); const result = prepareFiscal(form, sale, { data: { ...issuer, crt: '3' }, version: 1 }, [{ productId, data: p.data, version: 1 }], { cnpj: d.issuerCnpj, name: 'Emitente teste' }, [{ method: 'cash', amount: '5', tendered: '5' }]); assert.ok(result.errors.some(s => s.includes('NF-e exige'))); assert.ok(result.errors.some(s => s.includes('base de ICMS'))); assert.equal(result.payload.numero, undefined); assert.equal(result.payload.serie, undefined); assert.equal(result.snapshot.items[0]!.total, '5.00'); });
test('fiscal bloqueia produção, configuração inválida e credencial fora da rede/filial/CNPJ', async () => {
    for (const config of [{ ...env, NODE_ENV: 'production' }, { ...env, FISCAL_FOCUS_HOMOLOG_TOKENS: '{' }, { ...env, FISCAL_PROVIDER: 'production' }]) {
        let calls = 0;
        const g = new FocusGateway(config, async () => { calls++; throw Error(); });
        assert.equal(g.integration(d).ready, false);
        await assert.rejects(() => g.execute(d, 'issue', {}));
        assert.equal(calls, 0);
    }
    const g = gateway(fetch);
    for (const patch of [{ tenantId: randomUUID() }, { unitId: randomUUID() }, { issuerCnpj: '00000000000000' }])
        assert.equal(g.integration({ ...d, ...patch }).ready, false);
});
test('fiscal verifica dígito da chave e bloqueia URLs de arquivo fora do provedor', () => {
    assert.ok(validAccessKey(key()));
    assert.equal(validAccessKey(key().slice(0, 43) + (key().endsWith('0') ? '1' : '0')), false);
    for (const path of ['https://externo.example/a.xml', '//externo.example/a.xml', '/arquivos/../a.xml', '/arquivos/a.xml?token=x', '/arquivos/a.xml#x', '/arquivos/%2e%2e/a.xml', '/arquivos/a.js'])
        assert.equal(safeAssetPath(path), undefined);
    assert.equal(safeAssetPath('/arquivos_development/a.xml'), '/arquivos_development/a.xml');
});
test('fiscal só autoriza referência, CNPJ e protocolo completos no ambiente 2', async () => {
    for (const extra of [{ ref: 'outra' }, { cnpj_emitente: '00000000000000' }, { protocolo_nota_fiscal: undefined }, { protocolo_nota_fiscal: { ambiente: '1', chave_nfe: key(), numero_protocolo: '123456789012345', status: '100' } }, { chave_nfe: '0'.repeat(44) }]) {
        const g = gateway(async () => Response.json(response(extra)));
        assert.equal((await g.execute(d, 'consult', {})).state, 'uncertain');
    }
    assert.equal((await gateway(async () => Response.json(response())).execute(d, 'consult', {})).state, 'authorized');
});
test('fiscal POST autorizado consulta protocolo completo, sem repetir POST', async () => { const calls: string[] = []; const g = gateway(async (url, init) => { assert.equal(new URL(String(url)).origin, 'https://homologacao.focusnfe.com.br'); assert.equal(init?.redirect, 'error'); calls.push(init?.method || 'GET'); return Response.json(response()); }); const r = await g.execute(d, 'issue', {}); assert.equal(r.state, 'authorized'); assert.deepEqual(calls, ['POST', 'GET']); });
test('fiscal diferencia rejeição conhecida de resposta perdida ou possivelmente duplicada', async () => { const run = (message: string) => gateway(async () => Response.json({ codigo: 'requisicao_invalida', mensagem: message }, { status: 400 })).execute(d, 'issue', {}); assert.equal((await run('Campo NCM inválido')).state, 'rejected'); assert.equal((await run('Referência já utilizada')).state, 'uncertain'); assert.equal((await gateway(async () => { throw Error('timeout'); }).execute(d, 'issue', {})).state, 'uncertain'); assert.equal((await gateway(async () => Response.json({ mensagem: 'aguarde' }, { status: 503 })).execute(d, 'issue', {})).state, 'uncertain'); });
test('fiscal não persiste credenciais nem CPF no retorno normalizado', async () => { const result = await gateway(async () => Response.json({ ref: d.reference, cnpj_emitente: d.issuerCnpj, status: 'erro_autorizacao', status_sefaz: token, mensagem_sefaz: '111.444.777-35 ' + token + ' ' + Buffer.from(token + ':').toString('base64') + ' 11144477735' })).execute(d, 'consult', {}); assert.ok(!JSON.stringify(result).includes(token)); assert.ok(!JSON.stringify(result).includes('11144477735')); assert.ok(!JSON.stringify(result).includes('111.444.777-35')); assert.equal(result.sefazCode, ''); assert.ok(!JSON.stringify(result).includes(Buffer.from(token + ':').toString('base64'))); });
test('fiscal recusa resposta JSON grande e não reconhece cancelamento sem chave verificada', async () => { assert.equal((await gateway(async () => new Response('x'.repeat(262145))).execute(d, 'consult', {})).state, 'uncertain'); assert.equal((await gateway(async () => Response.json(response({ status: 'cancelado', status_sefaz: '135', numero_protocolo: '123456789012346', protocolo_nota_fiscal: undefined }))).execute(d, 'cancel', {})).state, 'uncertain'); });
test('fiscal limita arquivos, força HTML como anexo e não segue redirecionamento', async () => { const g = gateway(async (_url, init) => { assert.equal(init?.redirect, 'error'); return new Response('<html>fixture</html>', { headers: { 'content-type': 'text/html' } }); }); assert.equal((await g.download(d, '/arquivos/a.html', 'danfe')).type, 'application/octet-stream'); await assert.rejects(() => g.download(d, '/arquivos/a.html', 'xml')); await assert.rejects(() => g.download(d, 'https://externo.example/a.pdf', 'danfe')); await assert.rejects(() => gateway(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/pdf' } })).download(d, '/arquivos/a.pdf', 'danfe')); });
test('fiscal transporta CEST e soma IBS/CBS somente sobre bases revisadas de cada item', () => {
    const productId = randomUUID(), form = draftInput({ saleId: randomUUID(), model: '65', nature: 'Venda de teste', recipient, bases: [{ productId, icmsBase: '10.00', pisBase: '10.00', cofinsBase: '10.00', ibsBase: '8.00' }], additional: '', requestKey: randomUUID() });
    const item = { id: randomUUID(), productId, code: 'TEST', name: 'Produto fictício', baseUnit: 'UN', quantity: '2', unitPrice: '5.00', gross: '10.00', discount: '0.00', total: '10.00' };
    const p = productInput({ unitId: d.unitId, productId, data: { ...profile, cest: '1234567', icmsCode: '00', icmsRate: '18', pisCode: '01', pisRate: '1.65', cofinsCode: '01', cofinsRate: '7.6', rtc: 'standard', ibsCode: '000', classification: '000001', ibsStateRate: '0.1', ibsCityRate: '0', cbsRate: '0.9' } });
    const r = prepareFiscal(form, { number: 'TEST', sandbox: true, gross: '10.00', discount: '0.00', total: '10.00', items: [item] }, { data: { ...issuer, crt: '3' }, version: 1 }, [{ productId, data: p.data, version: 1 }], { cnpj: d.issuerCnpj, name: 'Emitente teste' }, [{ method: 'cash', amount: '10.00', tendered: '10.00' }]);
    assert.deepEqual(r.errors, []);
    assert.equal((r.payload.items as any[])[0].cest, '1234567');
    assert.equal(r.snapshot.items[0]!.taxes.icms, '1.80');
    assert.equal(r.snapshot.items[0]!.taxes.pis, '0.17');
    assert.equal(r.payload.ibs_cbs_base_calculo, '8.00');
    assert.equal(r.payload.ibs_valor_total, '0.01');
    assert.equal(r.payload.cbs_valor_total, '0.07');
    assert.equal(r.payload.valor_total, '10.00');
});

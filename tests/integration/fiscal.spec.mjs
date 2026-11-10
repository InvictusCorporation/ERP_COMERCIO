import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authDatabase } from '../support/auth-database.mjs';
import { AppModule } from '../../apps/api/dist/app.module.js';
import { createApplication } from '../../apps/api/dist/application.js';
import { newMfaSecret, encrypt, totp } from '../../apps/api/dist/modules/identity/crypto.js';
import { FocusGateway } from '../../apps/api/dist/modules/fiscal/focus.gateway.js';
const cnpj = '11222333000181';
const profile = { ncm: '10063021', cest: '', cfop: '5102', origin: '0', icmsCode: '102', icmsRate: '0', pisCode: '07', pisRate: '0', cofinsCode: '07', cofinsRate: '0', rtc: 'not_applicable', ibsCode: '', classification: '', ibsStateRate: '0', ibsCityRate: '0', cbsRate: '0', reviewed: true };
const issuer = { uf: 'CE', crt: '1', ie: '123456789', municipalityCode: '2304400', city: 'Fortaleza', street: 'Rua de teste', number: '10', district: 'Centro', postalCode: '60000000', reviewed: true };
const recipient = { name: 'Cliente fictício', document: '11144477735', ieIndicator: '9', ie: '', uf: 'CE', municipalityCode: '2304400', city: 'Fortaleza', street: 'Rua Teste', number: '20', district: 'Centro', postalCode: '60000000' };
function key(model) {
    const prefix = '232611' + cnpj + model + '0010000000011' + '12345678';
    let sum = 0, w = 2;
    for (let x = prefix.length - 1; x >= 0; x--) {
        sum += Number(prefix[x]) * w;
        w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    return prefix + String(r < 2 ? 0 : 11 - r);
}
test('Fiscal: preparação, homologação com transporte sintético, conciliação e escopo', async (t) => {
    const f = await authDatabase();
    let app, url, owner, normal, unit, unitB, product, register, sale, document, gateway;
    const calls = [], remote = new Map();
    let behavior = 'authorized', failPost = false, failGet = false;
    const fakeFetch = async (raw, init = {}) => {
        const u = new URL(raw);
        assert.equal(u.origin, 'https://homologacao.focusnfe.com.br');
        assert.match(init.headers.Authorization, /^Basic /);
        calls.push({ method: init.method || 'GET', path: u.pathname, ref: u.searchParams.get('ref') });
        if (u.pathname.startsWith('/arquivos'))
            return new Response('<fixture test="true"/>', { headers: { 'content-type': 'application/xml' } });
        const ref = u.searchParams.get('ref') || u.pathname.split('/').at(-1), model = u.pathname.includes('nfce') ? '65' : '55';
        if (init.method === 'POST') {
            assert.ok(!JSON.parse(init.body).numero);
            remote.set(ref, { model, state: behavior });
            if (failPost)
                throw Error('Synthetic network loss');
            if (behavior === 'processing')
                return Response.json({ ref, cnpj_emitente: cnpj, status: 'processando_autorizacao' }, { status: 202 });
        }
        if ((init.method || 'GET') === 'GET' && failGet)
            throw Error('Synthetic consultation loss');
        if (init.method === 'DELETE')
            remote.get(ref).state = 'cancelled';
        const state = remote.get(ref)?.state;
        if (!state)
            return Response.json({ codigo: 'nao_encontrado', mensagem: 'Não encontrado' }, { status: 404 });
        const k = key(model);
        if (state === 'rejected')
            return Response.json({ ref, cnpj_emitente: cnpj, status: 'erro_autorizacao', status_sefaz: '999', mensagem_sefaz: 'Rejeição sintética de teste' });
        if (state === 'processing')
            return Response.json({ ref, cnpj_emitente: cnpj, status: 'processando_autorizacao' }, { status: 200 });
        return Response.json({ ref, cnpj_emitente: cnpj, status: state === 'cancelled' ? 'cancelado' : 'autorizado', status_sefaz: state === 'cancelled' ? '135' : '100', mensagem_sefaz: 'Retorno sintético para testes', chave_nfe: k, numero_protocolo: state === 'cancelled' ? '123456789012346' : '123456789012345', protocolo_nota_fiscal: { ambiente: '2', chave_nfe: k, numero_protocolo: '123456789012345', status: '100' }, caminho_xml_nota_fiscal: '/arquivos_development/' + k + '.xml', caminho_xml_cancelamento: '/arquivos_development/' + k + '-cancel.xml' });
    };
    const proxy = { integration: d => gateway ? gateway.integration(d) : { provider: 'disabled', ready: false, message: 'Fixture sem credencial' }, execute: (...a) => gateway.execute(...a), download: (...a) => gateway.download(...a) };
    const req = async (p, s, b, headers = {}) => { const r = await fetch(url + p, { method: b === undefined ? 'GET' : 'POST', headers: { ...(b === undefined ? {} : { 'Content-Type': 'application/json', Origin: f.config.origin }), ...(s ? { Cookie: s.cookie, 'X-CSRF-Token': s.data.csrf } : {}), ...headers }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
    const post = (p, b, s = owner) => req(p, s, b), get = (p, s = owner) => req(p, s);
    const ok = async (p, b) => { const r = await post('fiscal/' + p, b); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
    const detail = async (id = document) => (await get('fiscal/documents/' + id)).data;
    const operation = async (kind, id = document, extra = {}) => post('fiscal/operations', { documentId: id, version: (await detail(id)).document.version, kind, reason: kind === 'cancel' ? 'Cancelamento sintético em homologação' : '', requestKey: randomUUID(), ...extra });
    const confirmedSale = async () => { const d = await post('pos/sales/save', { registerId: register, items: [{ productId: product, quantity: '1', expectedPrice: '5' }], discount: '0', notes: 'Venda sintética do fiscal', requestKey: randomUUID() }); assert.equal(d.status, 200); const sd = (await get('pos/sales/' + d.data.id)).data; const p = await post('pos/payments', { saleId: d.data.id, version: sd.sale.version, methods: [{ method: 'cash', amount: '5', tendered: '5' }], requestKey: randomUUID() }); assert.equal((await post('pos/payments/simulate', { paymentId: p.data.id, outcome: 'confirmed' })).status, 200); return d.data.id; };
    const draft = (saleId = sale, model = '65', extra = {}) => ({ saleId, model, nature: 'Venda interna de teste', recipient: model === '55' ? recipient : { ...recipient, name: '', document: '', uf: '', municipalityCode: '', city: '', street: '', number: '', district: '', postalCode: '' }, bases: [], additional: 'Fixture sem valor fiscal', requestKey: randomUUID(), ...extra });
    try {
        app = await createApplication(AppModule.register(f.appUrl, f.config, undefined, proxy), f.config.origin);
        await app.listen(0, '127.0.0.1');
        url = (await app.getUrl()) + '/api/v1/';
        const secret = newMfaSecret();
        await f.admin.query('UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2', [encrypt(secret, f.key), f.users.owner.id]);
        owner = await post('auth/login', { email: f.users.owner.email, password: f.users.owner.password }, null);
        owner = await post('auth/mfa/verify', { code: totp(secret, f.users.owner.email).generate() }, owner);
        assert.equal(owner.status, 200);
        normal = await post('auth/login', { email: f.users.normal.email, password: f.users.normal.password }, null);
        const company = await post('organizations/companies/save', { legalName: 'Comércio fiscal de teste', tradeName: 'Comércio fiscal', cnpj, matrixCode: 'MAT', active: true });
        assert.equal(company.status, 200);
        unit = company.data.matrixId;
        unitB = (await post('organizations/units/save', { companyId: company.data.id, parentId: unit, kind: 'filial', code: 'B', name: 'Filial B', cnpj: null, active: true })).data.id;
        await post('auth/unit', { unitId: unit });
        product = (await post('inventory/products/save', { code: 'ARROZ', name: 'Arroz de teste', description: '', category: 'Mercearia', brand: '', baseUnit: 'UN', packageName: '', packageFactor: '1', barcodes: [], salePrice: '5', desiredMargin: '30', minimumMargin: '10', minimumStock: '0', idealStock: '0', active: true })).data.id;
        assert.equal((await post('inventory/movements', { unitId: unit, productId: product, kind: 'entry', quantity: '50', cost: '3', packaged: false, reason: 'Estoque fictício fiscal', requestKey: randomUUID() })).status, 200);
        register = (await post('pos/registers/open', { unitId: unit, code: 'FISCAL-01', openingAmount: '100', requestKey: randomUUID() })).data.id;
        sale = await confirmedSale();
        await t.test('autenticação, CSRF e autorização não podem ser forjados pelo cliente', async () => {
            assert.equal((await get('fiscal/overview', null)).status, 401);
            assert.equal((await get('fiscal/overview', normal)).status, 403);
            const i = { unitId: unit, data: issuer };
            for (const headers of [{ 'X-CSRF-Token': '' }, { Origin: 'https://externo.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }])
                assert.equal((await req('fiscal/issuer', owner, i, headers)).status, 403);
            assert.equal((await post('fiscal/documents/prepare', { ...draft(), state: 'authorized', protocol: '123' })).status, 400);
        });
        await t.test('rascunho com cadastros pendentes não tem número, chave ou protocolo e não rebaixa estoque', async () => { const input = draft(); document = (await ok('documents/prepare', input)).id; assert.equal((await ok('documents/prepare', input)).id, document); const d = await detail(); assert.equal(d.document.state, 'draft'); assert.ok(d.document.validationErrors.length >= 2); assert.equal(d.document.key, null); assert.equal(d.document.number, null); assert.equal(d.document.protocol, null); assert.equal((await operation('issue')).status, 503); assert.equal(calls.length, 0); const stock = (await get('inventory/products/' + product + '?unitId=' + unit)).data.product.stock; assert.equal(Number(stock.physical), 49); });
        await t.test('emitente e produto são versionados, revisados e congelados no documento', async () => { await ok('issuer', { unitId: unit, data: issuer }); await ok('products', { unitId: unit, productId: product, data: profile }); const before = await detail(); await ok('documents/prepare', draft(sale, '65', { id: document, version: before.document.version })); let d = await detail(); assert.deepEqual(d.document.validationErrors, []); assert.equal(d.snapshot.sandboxSource, true); assert.equal(d.snapshot.profiles[0].data.ncm, profile.ncm); assert.equal((await post('fiscal/issuer', { unitId: unit, version: 999, data: issuer })).status, 409); const products = (await get('fiscal/products?query=ARROZ')).data; assert.equal(products.items[0].profile.data.ncm, profile.ncm); });
        await t.test('credencial é vinculada à rede, filial e CNPJ; empresa homônima não ganha acesso', async () => { const env = { NODE_ENV: 'test', FISCAL_PROVIDER: 'focus_homologation', FISCAL_FOCUS_HOMOLOG_TOKENS: JSON.stringify({ [f.tenantA + '/' + unit + '/' + cnpj]: 'synthetic_token_fiscal_test' }) }; gateway = new FocusGateway(env, fakeFetch); assert.equal(gateway.integration({ tenantId: f.tenantA, unitId: unit, issuerCnpj: cnpj }).ready, true); assert.equal(gateway.integration({ tenantId: f.tenantB, unitId: unit, issuerCnpj: cnpj }).ready, false); assert.equal(gateway.integration({ tenantId: f.tenantA, unitId: unitB, issuerCnpj: cnpj }).ready, false); });
        await t.test('emissão NFC-e usa referência estável e protocolo completo de homologação', async () => { const version = (await detail()).document.version, keyReq = randomUUID(); const input = { documentId: document, version, kind: 'issue', reason: '', requestKey: keyReq }; const results = await Promise.all([post('fiscal/operations', input), post('fiscal/operations', input)]); assert.ok(results.every(r => r.status === 200), JSON.stringify(results)); const d = await detail(); assert.equal(d.document.state, 'authorized'); assert.equal(d.document.key, key('65')); assert.equal(d.document.protocol, '123456789012345'); assert.equal(calls.filter(c => c.method === 'POST').length, 1); assert.equal((await operation('issue')).status, 409); const sd = (await get('pos/sales/' + sale)).data; assert.equal((await post('pos/sales/return', { saleId: sale, registerId: register, version: sd.sale.version, reason: 'Retorno com documento ativo', requestKey: randomUUID() })).status, 409); });
        await t.test('download privado é auditado; cancelamento não devolve estoque automaticamente', async () => { const r = await fetch(url + 'fiscal/documents/' + document + '/files/xml', { headers: { Cookie: owner.cookie } }); assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /homologacao/); assert.match(await r.text(), /fixture/); assert.equal((await post('fiscal/operations', { documentId: document, version: (await detail()).document.version, kind: 'cancel', reason: 'curta', requestKey: randomUUID() })).status, 400); assert.equal((await operation('cancel')).status, 200); const d = await detail(); assert.equal(d.document.state, 'cancelled'); assert.ok(d.document.cancelProtocol); assert.equal((await get('pos/sales/' + sale)).data.sale.status, 'confirmed'); const sd = (await get('pos/sales/' + sale)).data; assert.equal((await post('pos/sales/return', { saleId: sale, registerId: register, version: sd.sale.version, reason: 'Devolução após cancelamento fiscal', requestKey: randomUUID() })).status, 200); });
        await t.test('NF-e modelo 55 exige destinatário e endereço e persiste rejeição conhecida', async () => { sale = await confirmedSale(); const input = draft(sale, '55'); document = (await ok('documents/prepare', input)).id; behavior = 'rejected'; assert.equal((await operation('issue')).status, 200); let d = await detail(); assert.equal(d.document.state, 'rejected'); assert.equal(d.document.key, null); assert.equal(d.document.protocol, null); assert.equal(d.operations[0].result.state, 'rejected'); behavior = 'authorized'; await ok('documents/prepare', { ...input, id: document, version: d.document.version }); assert.equal((await operation('issue')).status, 200); assert.equal((await detail()).document.key, key('55')); });
        await t.test('resposta perdida mantém pendência e só consulta, sem repetir o POST', async () => { sale = await confirmedSale(); document = (await ok('documents/prepare', draft())).id; failPost = true; assert.equal((await operation('issue')).status, 200); assert.equal((await detail()).document.state, 'uncertain'); const count = calls.filter(c => c.method === 'POST').length; failPost = false; assert.equal((await operation('issue')).status, 409); assert.equal((await operation('consult')).status, 200); assert.equal((await detail()).document.state, 'authorized'); assert.equal(calls.filter(c => c.method === 'POST').length, count); });
        await t.test('processamento assíncrono não significa autorização; consulta converge', async () => { sale = await confirmedSale(); document = (await ok('documents/prepare', draft())).id; behavior = 'processing'; await operation('issue'); let d = await detail(); assert.equal(d.document.state, 'processing'); assert.equal(d.document.protocol, null); assert.equal((await post('fiscal/documents/discard', { documentId: document, version: d.document.version, reason: 'Não descartar pendência externa' })).status, 409); remote.get(d.document.reference).state = 'authorized'; await operation('consult'); assert.equal((await detail()).document.state, 'authorized'); behavior = 'authorized'; });
        await t.test('falha na auditoria antes do envio impede rede, depois do envio exige conciliação', async () => {
            sale = await confirmedSale();
            document = (await ok('documents/prepare', draft())).id;
            const before = calls.length;
            await f.admin.query("CREATE FUNCTION audit.reject_fiscal_test() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END $fn$");
            await f.admin.query("CREATE TRIGGER reject_fiscal_test BEFORE INSERT ON audit.events FOR EACH ROW WHEN (NEW.action='fiscal_operation.created') EXECUTE FUNCTION audit.reject_fiscal_test()");
            try {
                assert.equal((await operation('issue')).status, 503);
            }
            finally {
                await f.admin.query('DROP TRIGGER reject_fiscal_test ON audit.events');
            }
            assert.equal(calls.length, before);
            assert.equal((await detail()).document.state, 'draft');
            await f.admin.query("CREATE TRIGGER reject_fiscal_test BEFORE INSERT ON audit.events FOR EACH ROW WHEN (NEW.action='fiscal_document.changed' AND NEW.after_data->>'state'='authorized') EXECUTE FUNCTION audit.reject_fiscal_test()");
            try {
                assert.equal((await operation('issue')).status, 503);
            }
            finally {
                await f.admin.query('DROP TRIGGER reject_fiscal_test ON audit.events');
            }
            assert.equal((await detail()).document.state, 'processing');
            await f.admin.query("UPDATE fiscal.operations SET lease_until=now()-interval '1 second' WHERE tenant_id=$1 AND document_id=$2", [f.tenantA, document]);
            const count = calls.filter(c => c.method === 'POST').length;
            await operation('consult');
            assert.equal((await detail()).document.state, 'authorized');
            assert.equal(calls.filter(c => c.method === 'POST').length, count);
        });
        await t.test('perfil alterado invalida conferência anterior; descarte libera origem sem apagar', async () => { sale = await confirmedSale(); document = (await ok('documents/prepare', draft())).id; const p = (await get('fiscal/products')).data.items[0].profile; await ok('products', { unitId: unit, productId: product, version: p.version, data: { ...profile, ncm: '10063029' } }); assert.equal((await operation('issue')).status, 409); let d = await detail(); await ok('documents/discard', { documentId: document, version: d.document.version, reason: 'Conferência desatualizada descartada' }); assert.equal((await detail()).document.state, 'discarded'); assert.ok((await get('fiscal/sources')).data.items.some(s => s.id === sale)); });
        await t.test('permissões por filial e MFA bloqueiam emissão e acesso entre redes', async () => { await post('access/roles/save', { name: 'Consulta fiscal limitada', permissions: ['organizations.read', 'fiscal.read'] }); const role = (await f.admin.query('SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2', [f.tenantA, 'Consulta fiscal limitada'])).rows[0].id, member = (await f.admin.query('SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2', [f.tenantA, f.users.normal.id])).rows[0].id; await post('access/members/change', { id: member, roleId: role, active: true, allUnits: false, unitIds: [unitB] }); assert.equal((await get('fiscal/documents/' + document, normal)).status, 404); assert.equal((await post('fiscal/issuer', { unitId: unitB, data: issuer }, normal)).status, 403); const other = await post('auth/login', { email: f.users.other.email, password: f.users.other.password }, null); assert.equal((await get('fiscal/documents/' + document, other)).status, 403); const privileges = (await f.admin.query("SELECT has_table_privilege('invictus_auth','fiscal.documents','UPDATE') AS update,has_table_privilege('invictus_auth','fiscal.operations','INSERT') AS insert")).rows[0]; assert.deepEqual(privileges, { update: false, insert: false }); const audit = await get('audit/events?category=fiscal'); assert.equal(audit.status, 200); assert.ok(audit.data.items.length > 0); assert.ok(!JSON.stringify(audit.data).includes('11144477735')); });
    }
    finally {
        if (app)
            await app.close();
        await f.admin.end();
    }
});

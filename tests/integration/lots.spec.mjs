import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authDatabase } from '../support/auth-database.mjs';
import { AppModule } from '../../apps/api/dist/app.module.js';
import { createApplication } from '../../apps/api/dist/application.js';
import { newMfaSecret, encrypt, totp } from '../../apps/api/dist/modules/identity/crypto.js';
const productInput = { code: 'LOTE', name: 'Produto com lote de teste', description: '', category: 'Mercearia', brand: '', baseUnit: 'UN', packageName: '', packageFactor: '1', barcodes: [], salePrice: '5', desiredMargin: '30', minimumMargin: '10', minimumStock: '10', idealStock: '30', active: true };
const plus = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
test('Lotes reais: validade, FEFO, perdas, compras, rastreabilidade e acesso', async (t) => {
    const f = await authDatabase();
    let app, url, owner, normal, unit, unitB, product, register, today, expired, near, valid, extra;
    const req = async (p, s, b, headers = {}) => { const r = await fetch(url + p, { method: b === undefined ? 'GET' : 'POST', headers: { ...(b === undefined ? {} : { 'Content-Type': 'application/json', Origin: f.config.origin }), ...(s ? { Cookie: s.cookie, 'X-CSRF-Token': s.data.csrf } : {}), ...headers }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
    const post = (p, b, s = owner) => req(p, s, b), get = (p, s = owner) => req(p, s);
    const ok = async (p, b) => { const r = await post(p, b); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
    const command = (action, changes = {}) => ({ unitId: unit, productId: product, action, quantity: '', code: '', manufacturedOn: '', expiresOn: '', reason: 'Conferência física fictícia', lossKind: '', movementId: '', alertDays: 30, requestKey: randomUUID(), ...changes });
    const create = (code, q, expiresOn) => ok('lots/commands', command('allocate', { code, quantity: String(q), expiresOn }));
    const detail = async (id) => (await get('lots/batches/' + id)).data;
    const stock = async () => (await get('inventory/products/' + product + '?unitId=' + unit)).data.product.stock;
    const prepareSale = async (quantity = 1) => { const d = await ok('pos/sales/save', { registerId: register, items: [{ productId: product, quantity: String(quantity), expectedPrice: '5' }], discount: '0', notes: 'Venda fictícia de lotes', requestKey: randomUUID() }); const s = (await get('pos/sales/' + d.id)).data.sale; const p = await ok('pos/payments', { saleId: d.id, version: s.version, methods: [{ method: 'cash', amount: String(quantity * 5), tendered: String(quantity * 5) }], requestKey: randomUUID() }); return { id: d.id, payment: p.id }; };
    try {
        app = await createApplication(AppModule.register(f.appUrl, f.config), f.config.origin);
        await app.listen(0, '127.0.0.1');
        url = (await app.getUrl()) + '/api/v1/';
        const secret = newMfaSecret();
        await f.admin.query('UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2', [encrypt(secret, f.key), f.users.owner.id]);
        owner = await post('auth/login', { email: f.users.owner.email, password: f.users.owner.password }, null);
        owner = await post('auth/mfa/verify', { code: totp(secret, f.users.owner.email).generate() }, owner);
        normal = await post('auth/login', { email: f.users.normal.email, password: f.users.normal.password }, null);
        assert.equal(owner.status, 200);
        const company = await ok('organizations/companies/save', { legalName: 'Empresa fictícia de lotes', tradeName: 'Teste lotes', cnpj: '11222333000181', matrixCode: 'MAT', active: true });
        unit = company.matrixId;
        unitB = (await ok('organizations/units/save', { companyId: company.id, parentId: unit, kind: 'filial', code: 'B', name: 'Filial B', cnpj: null, active: true })).id;
        await ok('auth/unit', { unitId: unit });
        product = (await ok('inventory/products/save', productInput)).id;
        await ok('inventory/movements', { unitId: unit, productId: product, kind: 'entry', quantity: '20', cost: '3.5', packaged: false, reason: 'Estoque fictício de lotes', requestKey: randomUUID() });
        register = (await ok('pos/registers/open', { unitId: unit, code: 'LOT-01', openingAmount: '100', requestKey: randomUUID() })).id;
        today = (await get('lots/overview')).data.today;
        await t.test('sessão, CSRF, formatos e campos imutáveis são obrigatórios', async () => {
            assert.equal((await get('lots/overview', null)).status, 401);
            assert.equal((await get('lots/overview', normal)).status, 403);
            assert.equal((await req('lots/commands', owner, command('settings'), { 'X-CSRF-Token': '' })).status, 403);
            for (const changes of [{ expiresOn: '2026-02-30' }, { quantity: '1.0001' }, { manufacturedOn: plus(today, 10), expiresOn: today }, { quantity: '-1' }, { code: 'INVALID\nCODE' }, { physical: '100' }])
                assert.equal((await post('lots/commands', { ...command('allocate', { code: 'TEST', quantity: '1', expiresOn: today }), ...changes })).status, 400);
            assert.equal((await post('lots/commands', command('allocate', { code: 'FUTURE', quantity: '1', manufacturedOn: plus(today, 1), expiresOn: plus(today, 10) }))).status, 409);
        });
        await t.test('classificar identifica saldo existente sem nova entrada ou custo', async () => { const before = await stock(); expired = (await create('VENCIDO', 3, plus(today, -1))).id; near = (await create('PRIMEIRO', 4, plus(today, 7))).id; valid = (await create('ULTIMO', 5, plus(today, 90))).id; assert.deepEqual(await stock(), before); const o = (await get('lots/overview')).data; assert.equal(o.summary.lots, 3); assert.equal(o.summary.expired, 1); assert.equal(o.summary.near, 1); assert.equal(o.summary.unclassifiedProducts, 1); const p = (await get('lots/products')).data.items[0]; assert.equal(Number(p.unallocated), 8); assert.equal(Number(p.sellable), 9); const catalog = (await get('pos/catalog')).data; assert.equal(Number(catalog.items[0].available), 9); });
        await t.test('mesma confirmação concorrente classifica uma vez; versão antiga não sobrescreve', async () => { const input = command('allocate', { code: 'EXTRA', quantity: '3', expiresOn: plus(today, 120) }); const r = await Promise.all([post('lots/commands', input), post('lots/commands', input)]); assert.ok(r.every(x => x.status === 200), JSON.stringify(r)); assert.equal(r[0].data.id, r[1].data.id); extra = r[0].data.id; assert.equal(Number((await detail(extra)).lot.quantity), 3); assert.equal((await post('lots/commands', command('block', { lotId: extra, version: 999 }))).status, 409); });
        await t.test('FEFO físico usa primeiro vencimento válido e devolve aos mesmos lotes', async () => { const sale = await prepareSale(6); await ok('pos/payments/simulate', { paymentId: sale.payment, outcome: 'confirmed' }); assert.equal(Number((await detail(near)).lot.quantity), 0); assert.equal(Number((await detail(valid)).lot.quantity), 3); assert.equal(Number((await detail(expired)).lot.quantity), 3); const trace = (await f.admin.query('SELECT b.code,(-e.quantity_delta)::text AS quantity FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id JOIN inventory.movements m ON m.tenant_id=e.tenant_id AND m.id=e.movement_id WHERE m.sale_id=$1 AND e.kind=\'sale\' ORDER BY b.expires_on', [sale.id])).rows; assert.deepEqual(trace, [{ code: 'PRIMEIRO', quantity: '4.000' }, { code: 'ULTIMO', quantity: '2.000' }]); assert.deepEqual((await get('pos/sales/' + sale.id)).data.lotAllocations.map(x => x.code), ['PRIMEIRO', 'ULTIMO']); assert.equal(Number((await stock()).physical), 14); assert.equal(Number((await stock()).value), 49); const s = (await get('pos/sales/' + sale.id)).data.sale; await ok('pos/sales/return', { saleId: sale.id, registerId: register, version: s.version, reason: 'Devolução fictícia por lote', requestKey: randomUUID() }); assert.equal(Number((await detail(near)).lot.quantity), 4); assert.equal(Number((await stock()).physical), 20); });
        await t.test('bloqueio após reserva impede confirmação e reverte pagamento, caixa e estoque juntos', async () => {
            const sale = await prepareSale(1);
            for (const id of [near, valid, extra]) {
                const d = await detail(id);
                await ok('lots/commands', command('block', { lotId: id, version: d.lot.version }));
            }
            const before = await stock();
            assert.equal((await post('pos/payments/simulate', { paymentId: sale.payment, outcome: 'confirmed' })).status, 409);
            assert.deepEqual(await stock(), before);
            let s = (await get('pos/sales/' + sale.id)).data;
            assert.equal(s.sale.status, 'pending');
            assert.equal(s.payments[0].state, 'pending');
            await ok('pos/sales/cancel', { saleId: sale.id, version: s.sale.version, reason: 'Cancelar teste após bloqueio' });
            for (const id of [near, valid, extra]) {
                const d = await detail(id);
                await ok('lots/commands', command('unblock', { lotId: id, version: d.lot.version }));
            }
        });
        await t.test('perda baixa uma vez por custo médio; estorno mantém histórico e recompõe lote', async () => { let d = await detail(expired); const input = command('loss', { lotId: expired, version: d.lot.version, quantity: '2', lossKind: 'expiration', reason: 'Descarte fictício por vencimento' }); await ok('lots/commands', input); await ok('lots/commands', input); assert.equal(Number((await detail(expired)).lot.quantity), 1); assert.equal(Number((await stock()).physical), 18); assert.equal(Number((await stock()).value), 63); let report = (await get('lots/losses?from=' + today + '&to=' + today)).data; assert.equal(report.summary.count, 1); assert.equal(Number(report.summary.net), 7); d = await detail(expired); await ok('lots/commands', command('reverse', { lotId: expired, version: d.lot.version, movementId: report.items[0].id, reason: 'Estorno fictício conferido' })); assert.equal(Number((await stock()).physical), 20); assert.equal(Number((await detail(expired)).lot.quantity), 3); report = (await get('lots/losses?from=' + today + '&to=' + today)).data; assert.equal(Number(report.summary.reversed), 7); assert.equal(Number(report.summary.net), 0); });
        await t.test('falha de auditoria reverte perda, lote e movimento no mesmo commit', async () => {
            const d = await detail(valid), before = await stock();
            await f.admin.query("CREATE FUNCTION audit.reject_lot_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$");
            await f.admin.query("CREATE TRIGGER reject_lot_fixture BEFORE INSERT ON audit.events FOR EACH ROW WHEN(NEW.action='lot_event.created') EXECUTE FUNCTION audit.reject_lot_fixture()");
            try {
                assert.equal((await post('lots/commands', command('loss', { lotId: valid, version: d.lot.version, quantity: '1', lossKind: 'damage' }))).status, 503);
            }
            finally {
                await f.admin.query('DROP TRIGGER reject_lot_fixture ON audit.events');
            }
            assert.deepEqual(await stock(), before);
            assert.equal((await detail(valid)).lot.quantity, d.lot.quantity);
        });
        await t.test('entrada de compra fica não classificada e estorno exige retirar a classificação', async () => { const p = (await ok('inventory/products/save', { ...productInput, code: 'COMPRA' })).id; const supplier = (await ok('purchasing/suppliers/save', { legalName: 'Fornecedor de teste', name: 'Fornecedor', cnpj: '11222333000181', stateRegistration: '', contactName: '', email: '', phone: '', address: '', city: 'Fortaleza', state: 'CE', postalCode: '', deliveryDays: 0, paymentTerms: '', notes: '', active: true })).id; const o = await ok('purchasing/orders/save', { unitId: unit, supplierId: supplier, items: [{ productId: p, quantity: '4', unitCost: '2', packaged: false }], freight: '0', extraCost: '0', discount: '0', expectedDate: today, notes: 'Compra fictícia lotes', requestKey: randomUUID() }); let d = (await get('purchasing/orders/' + o.id)).data; await ok('purchasing/orders/transition', { id: o.id, version: d.order.version, action: 'approve', reason: '' }); d = (await get('purchasing/orders/' + o.id)).data; const r = await ok('purchasing/receipts', { orderId: o.id, version: d.order.version, items: [{ lineId: d.order.items[0].id, quantity: '4' }], document: 'REC-LOTE', notes: 'Teste', requestKey: randomUUID() }); const b = await ok('lots/commands', command('allocate', { productId: p, code: 'COMPRA-LOTE', quantity: '4', expiresOn: plus(today, 60) })); const rd = (await get('purchasing/orders/' + o.id)).data; const reverse = { id: r.id, version: rd.order.version, reason: 'Estorno de compra fictícia', requestKey: randomUUID() }; assert.equal((await post('purchasing/receipts/reverse', reverse)).status, 409); const bd = await detail(b.id); await ok('lots/commands', command('withdraw', { productId: p, lotId: b.id, version: bd.lot.version, quantity: '4' })); await ok('purchasing/receipts/reverse', reverse); assert.equal(Number((await get('inventory/products/' + p + '?unitId=' + unit)).data.product.stock.physical), 0); });
        await t.test('paginação, reposição por saldo vendável e datas de relatório são verificáveis', async () => {
            await ok('inventory/movements', { unitId: unit, productId: product, kind: 'entry', quantity: '25', cost: '3.5', packaged: false, reason: 'Entrada fictícia para paginação', requestKey: randomUUID() });
            for (let x = 0; x < 21; x++)
                await create('PAG-' + String(x).padStart(2, '0'), 1, plus(today, 180));
            const a = (await get('lots/batches')).data, b = (await get('lots/batches?page=1')).data;
            assert.equal(a.items.length, 20);
            assert.ok(b.items.length >= 5);
            assert.equal(a.total, b.total);
            assert.equal((await get('lots/losses?from=2026-12-01&to=2026-01-01')).status, 400);
            const p = (await get('lots/products?query=LOTE')).data.items.find(x => x.id === product);
            assert.equal(Number(p.suggestion), Math.max(0, 30 - Number(p.sellable)));
            assert.ok((await get('lots/batches?status=expired')).data.items.every(x => x.status === 'expired'));
        });
        await t.test('limites do alerta são versionados sem permitir desligar rastreabilidade', async () => { const p = (await get('lots/products?query=LOTE')).data.items.find(x => x.id === product); await ok('lots/commands', command('settings', { version: p.controlVersion, alertDays: 1 })); assert.equal((await post('lots/commands', command('settings', { version: p.controlVersion, alertDays: 2 }))).status, 409); assert.equal((await post('lots/commands', command('settings'))).status, 409); assert.equal((await post('lots/commands', command('settings', { lotId: valid, version: 1 }))).status, 400); });
        await t.test('saída genérica não consome lote identificado; perda manual sem lote entra no relatório', async () => { const p = (await get('lots/products?query=LOTE')).data.items.find(x => x.id === product), before = await stock(); const movement = { unitId: unit, productId: product, kind: 'out', quantity: String(Number(p.unallocated) + 1), cost: '0', packaged: false, reason: 'Tentativa de consumir lote fora do fluxo', requestKey: randomUUID() }; assert.equal((await post('inventory/movements', movement)).status, 409); assert.deepEqual(await stock(), before); await ok('inventory/movements', { ...movement, kind: 'loss', quantity: '1', reason: 'Perda manual de saldo sem lote', requestKey: randomUUID() }); const report = (await get('lots/losses?from=' + today + '&to=' + today)).data; assert.ok(report.items.some(x => x.lotId === null)); assert.equal(Number(report.summary.net), 3.5); });
        await t.test('validade no dia ainda é vendável; perda por vencimento não antecipa descarte', async () => { const b = (await create('VENCE-HOJE', 1, today)).id, d = await detail(b); assert.equal(d.lot.status, 'near'); assert.equal((await post('lots/commands', command('loss', { lotId: b, version: d.lot.version, quantity: '1', lossKind: 'expiration' }))).status, 409); assert.equal((await post('lots/commands', command('settings', { alertDays: 366 }))).status, 400); });
        await t.test('código reutilizado com vencimento diferente mantém duas identidades imutáveis', async () => { const a = await create('REUTILIZADO', 1, plus(today, 50)), b = await create('REUTILIZADO', 1, plus(today, 70)); assert.notEqual(a.id, b.id); assert.equal((await post('lots/commands', command('allocate', { code: 'REUTILIZADO', quantity: '1', expiresOn: plus(today, 50) }))).status, 409); assert.equal((await get('lots/batches?query=REUTILIZADO')).data.total, 2); });
        await t.test('escopo por filial, MFA e papéis de banco protegem lotes e histórico', async () => { await ok('access/roles/save', { name: 'Consulta lotes limitada', permissions: ['organizations.read', 'products.read', 'stock.read'] }); const role = (await f.admin.query('SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2', [f.tenantA, 'Consulta lotes limitada'])).rows[0].id, member = (await f.admin.query('SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2', [f.tenantA, f.users.normal.id])).rows[0].id; await ok('access/members/change', { id: member, roleId: role, active: true, allUnits: false, unitIds: [unitB] }); assert.equal((await post('auth/unit', { unitId: unitB }, normal)).status, 200); assert.equal((await get('lots/batches/' + valid, normal)).status, 404); assert.equal((await post('lots/commands', command('settings', { unitId: unitB }), normal)).status, 403); const priv = (await f.admin.query("SELECT has_table_privilege('invictus_auth','inventory.lots','UPDATE') AS update,has_table_privilege('invictus_auth','inventory.lot_events','INSERT') AS insert")).rows[0]; assert.deepEqual(priv, { update: false, insert: false }); assert.ok((await get('audit/events?category=inventory&query=Produto')).data.items.some(e => e.action.startsWith('lot'))); });
    }
    finally {
        if (app)
            await app.close();
        await f.admin.end();
    }
});

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createE2EUser } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
const product = {
    code: "1001",
    name: "Arroz Tipo 1 - 5 kg",
    description: "",
    category: "Mercearia",
    brand: "Marca teste",
    baseUnit: "UN",
    packageName: "Fardo",
    packageFactor: "10",
    barcodes: ["4006381333931"],
    salePrice: "5",
    desiredMargin: "30",
    minimumMargin: "20",
    minimumStock: "20",
    idealStock: "100",
    active: true,
};
async function seed(page: any) {
    const user = await createE2EUser({ mfaRequired: true, isolatedTenant: true, isolateAuthIpCounters: true });
    let r = await page.request.post("/api/v1/auth/login", {
        data: { email: user.email, password: user.password },
        headers: { Origin: origin },
    });
    expect(r.status()).toBe(200);
    let s = await r.json();
    r = await page.request.post("/api/v1/auth/mfa/enroll", {
        data: {},
        headers: { Origin: origin, "X-CSRF-Token": s.csrf },
    });
    expect(r.status()).toBe(200);
    const setup = await r.json();
    r = await page.request.post("/api/v1/auth/mfa/verify", {
        data: { code: totp(setup.secret, user.email).generate() },
        headers: { Origin: origin, "X-CSRF-Token": s.csrf },
    });
    expect(r.status()).toBe(200);
    s = await r.json();
    const post = async (path: string, data: any) => {
        const r = await page.request.post("/api/v1/" + path, {
            data,
            headers: { Origin: origin, "X-CSRF-Token": s.csrf },
        });
        const result = await r.json();
        expect(r.status(), JSON.stringify(result)).toBe(200);
        return result;
    };
    const company = await post("organizations/companies/save", {
        legalName: "Supermercado Exemplo Ltda.",
        tradeName: "Supermercado Exemplo",
        cnpj: "12ABC34501DE35",
        matrixCode: "MAT",
        active: true,
    });
    await post("auth/unit", { unitId: company.matrixId });
    const p = await post("inventory/products/save", product);
    await post('inventory/movements', { unitId: company.matrixId, productId: p.id, kind: 'entry', quantity: '20', cost: '3.5', packaged: false, reason: 'Estoque fictício do PDV', requestKey: randomUUID() });
    const open = () => post('pos/registers/open', { unitId: company.matrixId, code: 'CX-01', openingAmount: '100', requestKey: randomUUID() });
    return { post, p, company, open };
}
const plus = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function context(page: any) { const f = await seed(page); const overview = await (await page.request.get('/api/v1/lots/overview')).json(); const command = (action: string, extra: any = {}) => f.post('lots/commands', { unitId: f.company.matrixId, productId: f.p.id, action, quantity: '', code: '', manufacturedOn: '', expiresOn: '', reason: 'Conferência física fictícia', lossKind: '', movementId: '', alertDays: 30, requestKey: randomUUID(), ...extra }); const batch = (code: string, quantity: string, offset: number) => command('allocate', { code, quantity, expiresOn: plus(overview.today, offset) }); return { ...f, today: overview.today, command, batch }; }
async function openLot(page: any, code: string) { await page.getByRole('button', { name: new RegExp('^Abrir lote ' + code + ' · ') }).click(); await expect(page.getByRole('heading', { name: 'Lote ' + code, exact: true })).toBeVisible(); }
async function classifyForm(page: any, today: string) { await page.getByRole('button', { name: 'Classificar estoque', exact: true }).click(); await page.getByRole('button', { name: 'Classificar 1001', exact: true }).click(); await page.getByLabel('Código do lote', { exact: true }).fill('LOTE-UI'); await page.getByLabel('Data de vencimento', { exact: true }).fill(plus(today, 15)); await page.getByLabel('Quantidade a classificar (UN)', { exact: true }).fill('5'); await page.getByLabel('Motivo da classificação ou configuração', { exact: true }).fill('Conferência física feita no teste'); await page.getByRole('checkbox', { name: /Ativar controle permanente/ }).check(); }
test('lotes exigem sessão e permissões de produtos e estoque', async ({ page }) => { await page.goto('/lotes'); await expect(page).toHaveURL(/login/); const user = await createE2EUser({ isolatedTenant: true, isolateAuthIpCounters: true }); await page.request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password }, headers: { Origin: origin } }); await page.goto('/lotes'); await expect(page.getByText('Seu perfil não permite consultar lotes e perdas.', { exact: true })).toBeVisible(); expect((await page.request.get('/api/v1/lots/overview')).status()).toBe(403); });
test('classificação pela tela identifica estoque sem duplicar quantidade ou custo', async ({ page }) => { const f = await context(page); await page.goto('/lotes'); await classifyForm(page, f.today); await page.getByRole('button', { name: 'Confirmar classificação', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Nenhuma nova entrada de estoque'); await expect(page.getByRole('heading', { name: 'Lote LOTE-UI', exact: true })).toBeVisible(); const stock = await (await page.request.get('/api/v1/inventory/products/' + f.p.id + '?unitId=' + f.company.matrixId)).json(); expect(Number(stock.product.stock.physical)).toBe(20); expect(Number(stock.product.stock.value)).toBe(70); expect((await (await page.request.get('/api/v1/lots/batches')).json()).total).toBe(1); });
test('filtros de validade e bloqueio mostram dados reais da filial', async ({ page }) => {
    const f = await context(page);
    await f.batch('VENCIDO', '3', -1);
    await f.batch('PROXIMO', '4', 5);
    const b = await f.batch('BLOQUEADO', '5', 90);
    const d = await (await page.request.get('/api/v1/lots/batches/' + b.id)).json();
    await f.command('block', { lotId: b.id, version: d.lot.version });
    await page.goto('/lotes');
    for (const [filter, code] of [['expired', 'VENCIDO'], ['near', 'PROXIMO'], ['blocked', 'BLOQUEADO']]) {
        await page.getByRole('combobox', { name: 'Situação do lote', exact: true }).selectOption(filter);
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await expect(page.getByRole('button', { name: new RegExp('^Abrir lote ' + code + ' · ') })).toBeVisible();
        await expect(page.getByRole('button', { name: /Abrir lote / })).toHaveCount(1);
    }
});
test('descarte e estorno preservam relatório e atualizam lote e estoque uma vez', async ({ page }) => { const f = await context(page); await f.batch('DESCARTE', '3', -1); await page.goto('/lotes'); await openLot(page, 'DESCARTE'); await page.getByLabel('Quantidade da operação (UN)', { exact: true }).fill('1'); await page.getByRole('combobox', { name: 'Tipo de perda', exact: true }).selectOption('expiration'); await page.getByLabel('Motivo da operação', { exact: true }).fill('Descarte conferido por vencimento'); await page.getByRole('button', { name: 'Confirmar descarte', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Descarte registrado uma vez'); await page.getByRole('button', { name: 'Relatório de perdas', exact: true }).click(); await expect(page.getByRole('cell', { name: 'Vencimento', exact: false })).toContainText('Descarte conferido'); await page.getByRole('button', { name: /Revisar descarte / }).click(); await page.getByLabel('Motivo da operação', { exact: true }).fill('Estorno do descarte após conferência'); await page.getByRole('button', { name: 'Confirmar estorno de descarte', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Descarte estornado'); const stock = await (await page.request.get('/api/v1/inventory/products/' + f.p.id + '?unitId=' + f.company.matrixId)).json(); expect(Number(stock.product.stock.physical)).toBe(20); await page.getByRole('button', { name: 'Relatório de perdas', exact: true }).click(); await expect(page.getByText('Estornado', { exact: true }).last()).toBeVisible(); const report = await (await page.request.get('/api/v1/lots/losses?from=' + f.today + '&to=' + f.today)).json(); expect(Number(report.summary.net)).toBe(0); expect(report.items).toHaveLength(1); });
test('bloqueio controla disponibilidade do PDV e venda exibe lote utilizado', async ({ page }) => { const f = await context(page); await f.open(); await f.batch('VENCIDO', '4', -1); await f.batch('VENDAVEL', '4', 30); await page.goto('/lotes'); await openLot(page, 'VENDAVEL'); await page.getByRole('combobox', { name: 'Operação no lote', exact: true }).selectOption('block'); await page.getByLabel('Motivo da operação', { exact: true }).fill('Bloqueio para conferência física'); await page.getByRole('button', { name: 'Confirmar operação no lote', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Controle de lote atualizado'); let catalog = await (await page.request.get('/api/v1/pos/catalog')).json(); expect(Number(catalog.items[0].available)).toBe(0); await page.getByRole('combobox', { name: 'Operação no lote', exact: true }).selectOption('unblock'); await page.getByLabel('Motivo da operação', { exact: true }).fill('Lote liberado após conferência'); await page.getByRole('button', { name: 'Confirmar operação no lote', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Controle de lote atualizado'); await page.goto('/pdv'); await page.getByRole('button', { name: /1001 · Mercearia/ }).click(); await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(page.getByRole('heading', { name: /VD-/ })).toBeVisible(); await page.getByLabel('Recebido (R$)', { exact: true }).fill('5'); await page.getByRole('button', { name: 'Preparar pagamento de teste', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar venda de teste', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Venda de teste confirmada'); await expect(page.getByText(/Lote VENDAVEL · vence/).first()).toBeVisible(); await page.goto('/vendas'); await page.getByRole('button', { name: 'Abrir venda', exact: true }).click(); await page.getByText('Comprovante de teste', { exact: true }).first().click(); await expect(page.locator('#pos-receipt')).toContainText('Lote VENDAVEL · vence'); });
test('resposta perdida na classificação reutiliza confirmação sem duplicar saldo', async ({ page }) => {
    const f = await context(page);
    let failed = false;
    await page.route('**/api/v1/lots/commands', async (route) => {
        const r = await route.fetch();
        if (!failed) {
            failed = true;
            await route.abort();
        }
        else
            await route.fulfill({ response: r });
    });
    await page.goto('/lotes');
    await classifyForm(page, f.today);
    await page.getByRole('button', { name: 'Confirmar classificação', exact: true }).click();
    await expect(page.locator('.pos-error[role=alert]')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar classificação', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Lote classificado');
    const batches = await (await page.request.get('/api/v1/lots/batches')).json();
    expect(batches.total).toBe(1);
    expect(Number(batches.items[0].quantity)).toBe(5);
});
test('alerta configurado antes da classificação protege entrada ainda sem lote', async ({ page }) => { const f = await context(page); await page.goto('/lotes'); await page.getByRole('button', { name: 'Classificar estoque', exact: true }).click(); await page.getByRole('button', { name: 'Configurar lotes de 1001', exact: true }).click(); await page.getByLabel('Alertar antes do vencimento (dias)', { exact: true }).fill('10'); await page.getByRole('checkbox', { name: /Ativar controle permanente/ }).check(); await page.getByLabel('Motivo da classificação ou configuração', { exact: true }).fill('Ativar rastreabilidade do produto'); await page.getByRole('button', { name: 'Salvar alertas', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Controle de lote atualizado'); const product = (await (await page.request.get('/api/v1/lots/products')).json()).items[0]; expect(product.tracking).toBe(true); expect(product.alertDays).toBe(10); expect(Number(product.unallocated)).toBe(20); expect(Number((await (await page.request.get('/api/v1/pos/catalog')).json()).items[0].available)).toBe(0); });
test('reposição sugerida desconta vencidos e saldo não classificado', async ({ page }) => { const f = await context(page); await f.batch('VALIDO', '5', 30); await f.batch('VENCIDO', '10', -1); await page.goto('/lotes'); await page.getByRole('button', { name: 'Reposição sugerida', exact: true }).click(); await expect(page.getByRole('cell', { name: '95 UN', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Conferir e criar pedido de compra', exact: true })).toBeVisible(); });
for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]])
    test('lotes responsivos ' + width, async ({ page }) => {
        const f = await context(page);
        await f.batch('VALIDO', '8', 30);
        const b = await f.batch('DESCARTE', '3', -1);
        let d = await (await page.request.get('/api/v1/lots/batches/' + b.id)).json();
        await f.command('loss', { lotId: b.id, version: d.lot.version, quantity: '1', lossKind: 'expiration', reason: 'Descarte fictício da captura' });
        await page.setViewportSize({ width, height });
        await page.goto('/lotes');
        await openLot(page, 'VALIDO');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            document.querySelectorAll('.pos-table-wrap').forEach(e => e.scrollLeft = 0);
            window.scrollTo(0, 0);
        });
        await page.screenshot({ path: '.local/screenshots/lotes-' + width + '.png', fullPage: true });
        for (const [tab, slug] of [['Classificar estoque', 'classificar'], ['Relatório de perdas', 'perdas'], ['Reposição sugerida', 'reposicao']]) {
            await page.getByRole('button', { name: tab, exact: true }).click();
            if (slug === 'classificar')
                await page.getByRole('button', { name: 'Classificar 1001', exact: true }).click();
            if (slug === 'perdas')
                await expect(page.getByRole('cell', { name: /Vencimento/ })).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.evaluate(() => {
                if (document.activeElement instanceof HTMLElement)
                    document.activeElement.blur();
                document.querySelectorAll('.pos-table-wrap').forEach(e => e.scrollLeft = 0);
                window.scrollTo(0, 0);
            });
            await page.screenshot({ path: '.local/screenshots/lotes-' + slug + '-' + width + '.png', fullPage: true });
        }
    });
test('mesmo código com vencimentos diferentes abre o lote correto', async ({ page }) => {
    const f = await context(page);
    await f.batch('REPETIDO', '3', 10);
    await f.batch('REPETIDO', '4', 20);
    await page.goto('/lotes');
    for (const [offset, q] of [[10, '3 UN'], [20, '4 UN']]) {
        const date = new Date(plus(f.today, Number(offset)) + 'T12:00:00Z').toLocaleDateString('pt-BR');
        await page.getByRole('button', { name: 'Abrir lote REPETIDO · ' + date, exact: true }).click();
        await expect(page.locator('.fin-editor .lot-values strong').first()).toHaveText(String(q));
        await page.getByRole('button', { name: 'Fechar lote', exact: true }).click();
    }
});

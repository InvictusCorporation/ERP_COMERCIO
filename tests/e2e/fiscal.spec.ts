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
        cnpj: "11222333000181",
        matrixCode: "MAT",
        active: true,
    });
    await post("auth/unit", { unitId: company.matrixId });
    const p = await post("inventory/products/save", product);
    await post('inventory/movements', { unitId: company.matrixId, productId: p.id, kind: 'entry', quantity: '20', cost: '3.5', packaged: false, reason: 'Estoque fictício do PDV', requestKey: randomUUID() });
    const open = () => post('pos/registers/open', { unitId: company.matrixId, code: 'CX-01', openingAmount: '100', requestKey: randomUUID() });
    const register = await open();
    const sale = await post('pos/sales/save', { registerId: register.id, items: [{ productId: p.id, quantity: '1', expectedPrice: '5' }], discount: '0', notes: 'Venda fictícia fiscal', requestKey: randomUUID() });
    const sd = await (await page.request.get('/api/v1/pos/sales/' + sale.id)).json();
    const payment = await post('pos/payments', { saleId: sale.id, version: sd.sale.version, methods: [{ method: 'cash', amount: '5', tendered: '5' }], requestKey: randomUUID() });
    await post('pos/payments/simulate', { paymentId: payment.id, outcome: 'confirmed' });
    return { post, p, company, sale };
}
const issuer = { uf: 'CE', crt: '1', ie: '123456789', municipalityCode: '2304400', city: 'Fortaleza', street: 'Rua fictícia', number: '10', district: 'Centro', postalCode: '60000000', reviewed: true };
const profile = { ncm: '10063021', cest: '', cfop: '5102', origin: '0', icmsCode: '102', icmsRate: '0', pisCode: '07', pisRate: '0', cofinsCode: '07', cofinsRate: '0', rtc: 'not_applicable', ibsCode: '', classification: '', ibsStateRate: '0', ibsCityRate: '0', cbsRate: '0', reviewed: true };
async function configure(f: any) { await f.post('fiscal/issuer', { unitId: f.company.matrixId, data: issuer }); await f.post('fiscal/products', { unitId: f.company.matrixId, productId: f.p.id, data: profile }); }
async function prepare(page: any) { await page.getByRole('button', { name: 'Nova emissão', exact: true }).click(); await page.locator('.fin-account-list button').first().click(); let prepared=false; const finished=page.waitForResponse((r:any)=>{const path=new URL(r.url()).pathname;if(path==='/api/v1/fiscal/documents/prepare'&&r.request().method()==='POST'&&r.status()===200){prepared=true;return false;}return prepared&&path==='/api/v1/fiscal/documents'&&r.request().method()==='GET'&&r.status()===200;}); await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click(); await finished; await expect(page.getByRole('status')).toContainText('Conferência salva'); }
async function draft(f: any) { return f.post('fiscal/documents/prepare', { saleId: f.sale.id, model: '65', nature: 'VENDA DE MERCADORIA', recipient: { name: '', document: '', ieIndicator: '9', ie: '', uf: '', municipalityCode: '', city: '', street: '', number: '', district: '', postalCode: '' }, bases: [], additional: 'Documento fictício sem valor fiscal', requestKey: randomUUID() }); }
test('fiscal exige sessão e permissão de consulta', async ({ page }) => { await page.goto('/fiscal'); await expect(page).toHaveURL(/login/); const user = await createE2EUser({ isolatedTenant: true, isolateAuthIpCounters: true }); await page.request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password }, headers: { Origin: origin } }); await page.goto('/fiscal'); await expect(page.getByText('Seu perfil não permite consultar o módulo fiscal.', { exact: true })).toBeVisible(); expect((await page.request.get('/api/v1/fiscal/overview')).status()).toBe(403); });
test('prepara NFC-e com pendências sem inventar autorização ou movimentar estoque', async ({ page }) => { const f = await seed(page); await page.goto('/fiscal'); await prepare(page); await expect(page.getByText(/Pendências de conferência/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Transmitir em homologação', exact: true })).toBeDisabled(); await expect(page.getByText('Nenhum envio realizado.', { exact: true })).toBeVisible(); const r = await (await page.request.get('/api/v1/fiscal/documents')).json(); expect(r.total).toBe(1); expect(r.items[0].key).toBeNull(); expect(r.items[0].number).toBeNull(); const stock = await (await page.request.get('/api/v1/inventory/products/' + f.p.id + '?unitId=' + f.company.matrixId)).json(); expect(Number(stock.product.stock.physical)).toBe(19); });
test('cadastro do emitente pelo formulário preserva identidade da organização', async ({ page }) => {
    const f = await seed(page);
    const documentsReady=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/fiscal/documents'&&r.request().method()==='GET'&&r.status()===200);
    await page.goto('/fiscal');
    await documentsReady;
    await expect(page.getByRole('button',{name:'Emitente',exact:true})).toBeEnabled();
    await page.getByRole('button', { name: 'Emitente', exact: true }).click();
    await expect(page.getByRole('button',{name:'Emitente',exact:true})).toHaveAttribute('aria-pressed','true');
    for (const [name, value] of Object.entries({ 'Inscrição estadual': issuer.ie, 'Código IBGE do município': issuer.municipalityCode, 'Município': issuer.city, 'Logradouro': issuer.street, 'Número': issuer.number, 'Bairro': issuer.district, 'CEP (8 dígitos)': issuer.postalCode }))
        await page.getByLabel(name, { exact: true }).fill(value);
    await page.getByRole('combobox', { name: 'UF do emitente', exact: true }).selectOption('CE');
    await page.getByRole('combobox', { name: 'Regime tributário (CRT)', exact: true }).selectOption('1');
    await page.getByLabel('Cadastro conferido pelo responsável fiscal', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvar emitente', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Emitente salvo');
    const o = await (await page.request.get('/api/v1/fiscal/overview')).json();
    expect(o.issuerCnpj).toBe('11222333000181');
    expect(o.issuer.version).toBe(1);
    expect(o.issuer.data.reviewed).toBe(true);
});
test('tributação por produto exige escolha explícita e salva na filial', async ({ page }) => {
    const f = await seed(page);
    await page.goto('/fiscal');
    await page.getByRole('button', { name: 'Tributação', exact: true }).click();
    await page.getByRole('button', { name: 'Configurar', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'CFOP', exact: true })).toHaveValue('');
    await page.getByLabel('NCM (8 dígitos)', { exact: true }).fill(profile.ncm);
    for (const [label, value] of [['CFOP', '5102'], ['Origem da mercadoria', '0'], ['ICMS · CST / CSOSN', '102'], ['PIS · CST', '07'], ['COFINS · CST', '07'], ['IBS / CBS', 'not_applicable']])
        await page.getByRole("combobox", { name: label, exact: true }).selectOption(value);
    for (const label of ['Alíquota ICMS (%)', 'Alíquota PIS (%)', 'Alíquota COFINS (%)', 'Alíquota IBS estadual (%)', 'Alíquota IBS municipal (%)', 'Alíquota CBS (%)'])
        await page.getByLabel(label, { exact: true }).fill('0');
    await page.getByLabel('Tributação conferida pelo responsável fiscal', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvar tributação', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Tributação salva');
    await expect(page.getByRole('cell', { name: 'Conferido · v1', exact: true })).toBeVisible();
});
test('conferência revisada elimina pendências mas envio continua desabilitado sem provedor', async ({ page }) => { const f = await seed(page); await draft(f); await configure(f); await page.goto('/fiscal'); await page.getByRole('button', { name: /Abrir documento INV-/ }).click(); await page.getByRole('button', { name: 'Revisar conferência', exact: true }).click(); await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Conferência salva'); await expect(page.getByText(/Pendências de conferência/)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Transmitir em homologação', exact: true })).toBeDisabled(); await expect(page.getByText('Emissão externa não habilitada', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'XML autorizado', exact: true })).toHaveCount(0); });
test('NF-e exige identificação completa e aceita correção da conferência', async ({ page }) => {
    const f = await seed(page);
    await configure(f);
    await page.goto('/fiscal');
    await page.getByRole('button', { name: 'Nova emissão', exact: true }).click();
    await page.locator('.fin-account-list button').first().click();
    await page.getByRole('combobox', { name: 'Modelo do documento', exact: true }).selectOption('55');
    await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
    await expect(page.getByText('NF-e exige identificação e endereço completo do destinatário.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revisar conferência', exact: true }).click();
    for (const [label, value] of [['Nome do destinatário', 'Cliente fictício'], ['CPF / CNPJ do destinatário', '11144477735'], ['IBGE do destinatário', '2304400'], ['Município do destinatário', 'Fortaleza'], ['Logradouro do destinatário', 'Rua fictícia'], ['Número do destinatário', '20'], ['Bairro do destinatário', 'Centro'], ['CEP do destinatário', '60000000']])
        await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('combobox', { name: 'UF do destinatário', exact: true }).selectOption('CE');
    await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Conferência salva');
    await expect(page.getByText(/Pendências de conferência/)).toHaveCount(0);
});
test('descarte preserva histórico e libera venda de origem', async ({ page }) => { const f = await seed(page); const d = await draft(f); await page.goto('/fiscal'); await page.getByRole('button', { name: /Abrir documento INV-/ }).click(); const discard = page.getByRole('button', { name: 'Descartar conferência local', exact: true }); await expect(discard).toBeDisabled(); await page.getByLabel('Justificativa (15 a 255 caracteres)', { exact: true }).fill('Refazer a conferência fiscal de teste'); await discard.click(); await expect(page.getByRole('status')).toContainText('descartado localmente'); const data = await (await page.request.get('/api/v1/fiscal/documents/' + d.id)).json(); expect(data.document.state).toBe('discarded'); await page.getByRole('button', { name: 'Nova emissão', exact: true }).click(); await expect(page.locator('.fin-account-list button')).toHaveCount(1); });
test('filtros combinam modelo, situação e referência interna', async ({ page }) => { const f = await seed(page); await draft(f); await page.goto('/fiscal'); await page.getByRole('combobox', { name: 'Modelo', exact: true }).selectOption('55'); await page.getByRole('button', { name: 'Filtrar', exact: true }).click(); await expect(page.getByText('Nenhum documento nesta consulta.', { exact: true })).toBeVisible(); await page.getByRole('combobox', { name: 'Modelo', exact: true }).selectOption('65'); await page.getByRole('combobox', { name: 'Situação', exact: true }).selectOption('draft'); await page.getByRole('button', { name: 'Filtrar', exact: true }).click(); await expect(page.getByRole('button', { name: /Abrir documento INV-/ })).toHaveCount(1); });
test('perda de resposta na preparação reaproveita a chave da confirmação', async ({ page }) => {
    const f = await seed(page);
    let failed = false;
    await page.route('**/api/v1/fiscal/documents/prepare', async (route) => {
        const r = await route.fetch();
        if (!failed) {
            failed = true;
            await route.abort();
        }
        else
            await route.fulfill({ response: r });
    });
    await page.goto('/fiscal');
    await page.getByRole('button', { name: 'Nova emissão', exact: true }).click();
    await page.locator('.fin-account-list button').first().click();
    await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
    await expect(page.locator('.pos-error[role=alert]')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar conferência', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Conferência salva');
    expect((await (await page.request.get('/api/v1/fiscal/documents')).json()).total).toBe(1);
});
for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]])
    test('fiscal responsivo ' + width, async ({ page }) => {
        const f = await seed(page);
        await configure(f);
        await draft(f);
        await page.setViewportSize({ width, height });
        await page.goto('/fiscal');
        await page.getByRole('button', { name: /Abrir documento INV-/ }).click();
        await expect(page.getByRole('button', { name: 'Transmitir em homologação', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            document.querySelectorAll('.pos-table-wrap').forEach(e => e.scrollLeft = 0);
            window.scrollTo(0, 0);
        });
        await page.screenshot({ path: '.local/screenshots/fiscal-' + width + '.png', fullPage: true });
        for (const tab of ['Emitente', 'Tributação', 'Nova emissão']) {
            await page.getByRole('button', { name: tab, exact: true }).click();
            if (tab === 'Tributação')
                await page.getByRole('button', { name: 'Configurar', exact: true }).click();
            if (tab === 'Nova emissão') {
                await expect(page.getByText(/Nenhuma venda disponível nesta consulta/)).toBeVisible();
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.evaluate(() => {
                if (document.activeElement instanceof HTMLElement)
                    document.activeElement.blur();
                document.querySelectorAll('.pos-table-wrap').forEach(e => e.scrollLeft = 0);
                window.scrollTo(0, 0);
            });
            await page.screenshot({ path: '.local/screenshots/fiscal-' + tab.replace(' ', '-') + '-' + width + '.png', fullPage: true });
        }
    });

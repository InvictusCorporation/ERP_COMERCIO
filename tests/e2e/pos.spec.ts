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
async function addSale(page: any) { await page.getByRole('button', { name: /1001 · Mercearia/ }).click(); await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(page.getByRole('heading', { name: /VD-/ })).toBeVisible(); }
async function prepare(page: any) { await page.getByRole('button', { name: 'Preparar pagamento de teste', exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirmar venda de teste', exact: true })).toBeVisible(); }
test('PDV exige sessão e permite caixa, venda, troco e comprovante de teste', async ({ page }) => {
    await page.goto('/pdv');
    await expect(page).toHaveURL(/login/);
    const f = await seed(page);
    await page.goto('/caixa');
    await page.getByLabel('Fundo de abertura (R$)', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Abrir caixa', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Caixa aberto');
    await page.getByRole('link', { name: 'Nova venda', exact: true }).click();
    await addSale(page);
    await page.getByLabel('Recebido (R$)', { exact: true }).fill('10');
    await prepare(page);
    await page.getByRole('button', { name: 'Simular autorização', exact: true }).click();
    await expect(page.getByText('Pagamento simulado: autorizado', { exact: true })).toBeVisible();
    let stock = await (await page.request.get('/api/v1/inventory/products/' + f.p.id + '?unitId=' + f.company.matrixId)).json();
    expect(Number(stock.product.stock.physical)).toBe(20);
    await page.getByRole('button', { name: 'Confirmar venda de teste', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Venda de teste confirmada');
    await expect(page.getByText(/Troco: R.*5,00/).first()).toBeVisible();
    await page.getByText('Comprovante de teste', { exact: true }).first().click();
    await expect(page.locator('#pos-receipt')).toContainText('SEM VALOR FISCAL');
    await expect(page.locator('#pos-receipt')).toContainText('Supermercado Exemplo');
    await page.evaluate(() => { (window as any).__printed = false; window.print = () => { (window as any).__printed = true; }; });
    await page.getByRole('button', { name: 'Imprimir comprovante de teste' }).click();
    expect(await page.evaluate(() => (window as any).__printed)).toBe(true);
});
test('carrinho móvel altera quantidade, remove e busca código de barras', async ({ page }) => { const f = await seed(page); await f.open(); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/pdv'); await page.getByLabel('Buscar produto ou código', { exact: true }).fill('4006381333931'); await page.getByRole('button', { name: 'Buscar', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Produto lido'); await page.getByRole('button', { name: 'Aumentar ' + product.name, exact: true }).click(); await expect(page.getByLabel('Quantidade de ' + product.name, { exact: true })).toHaveValue('2'); await page.getByRole('button', { name: 'Diminuir ' + product.name, exact: true }).click(); await page.getByRole('button', { name: 'Remover ' + product.name, exact: true }).click(); await expect(page.getByText('O carrinho está vazio.', { exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); });
test('pagamento misto é confirmado e devolvido com trilha no histórico', async ({ page }) => { const f = await seed(page); await f.open(); await page.goto('/pdv'); await addSale(page); await page.getByLabel('Valor (R$)', { exact: true }).fill('2'); await page.getByLabel('Recebido (R$)', { exact: true }).fill('10'); await page.getByRole('button', { name: 'Adicionar forma', exact: true }).click(); await page.getByLabel('Valor (R$)', { exact: true }).nth(1).fill('3'); await prepare(page); await page.getByRole('button', { name: 'Confirmar venda de teste', exact: true }).click(); await expect(page.getByRole('status')).toContainText('confirmada'); await page.getByRole('link', { name: 'Vendas', exact: true }).click(); const detailReady=page.waitForResponse(r=>/\/api\/v1\/pos\/sales\/[a-f0-9-]{36}$/.test(new URL(r.url()).pathname)&&r.request().method()==='GET'&&r.status()===200); await page.getByRole('button', { name: 'Abrir venda', exact: true }).click(); await detailReady; await expect(page.getByRole('button',{name:'Atualizar PDV',exact:true})).toBeEnabled(); await page.getByLabel('Motivo do cancelamento ou devolução', { exact: true }).fill('Devolução integral conferida no caixa'); await page.getByRole('button', { name: 'Confirmar devolução integral de teste', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Devolução integral'); await expect(page.getByRole('cell', { name: 'Devolvida', exact: true })).toBeVisible(); });
test('recusa volta ao rascunho e pendência pode ser cancelada', async ({ page }) => { const f = await seed(page); await f.open(); await page.goto('/pdv'); await addSale(page); await prepare(page); await page.getByRole('button', { name: 'Simular recusa', exact: true }).click(); await expect(page.getByRole('status')).toContainText('recusado'); await prepare(page); await page.getByLabel('Motivo do cancelamento ou devolução', { exact: true }).fill('Cliente desistiu da compra de teste'); await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click(); await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible(); await page.getByText(/Histórico de pagamentos/).click(); await expect(page.getByText(/cancelled/)).toBeVisible(); });
test('saldo insuficiente mantém pagamento pendente sem concluir venda', async ({ page }) => { const f = await seed(page); await f.open(); await page.goto('/pdv'); await page.getByRole('button', { name: /1001 · Mercearia/ }).click(); await page.getByLabel('Quantidade de ' + product.name, { exact: true }).fill('21'); await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await prepare(page); await page.getByRole('button', { name: 'Confirmar venda de teste', exact: true }).click(); await expect(page.locator('.pos-error[role=alert]')).toContainText('Operação fora de sequência'); await expect(page.getByRole('button', { name: 'Confirmar venda de teste', exact: true })).toBeVisible(); });
test('caixa registra suprimento e fechamento com diferença', async ({ page }) => { const f = await seed(page); await f.open(); await page.goto('/caixa'); await page.getByRole('button', { name: /CX-01 · Aberto/ }).click(); await page.getByLabel('Valor (R$)', { exact: true }).fill('20'); await page.getByLabel('Motivo', { exact: true }).fill('Suprimento para troco'); await page.getByRole('button', { name: 'Registrar movimentação', exact: true }).click(); await expect(page.getByText('Saldo esperado: R$ 120,00', { exact: true })).toBeVisible(); await page.getByLabel('Dinheiro contado (R$)', { exact: true }).fill('119'); await page.getByRole('button', { name: 'Fechar caixa conferido', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Caixa fechado'); await expect(page.getByText(/Diferença:.*1,00/)).toBeVisible(); });
test('repetir rascunho após resposta perdida não duplica venda', async ({ page }) => { const f = await seed(page); await f.open(); await page.goto('/pdv'); await page.getByRole('button', { name: /1001 · Mercearia/ }).click(); let failed = false; await page.route('**/api/v1/pos/sales/save', async (route) => { const response = await route.fetch(); if (!failed) {
    failed = true;
    await route.abort();
}
else
    await route.fulfill({ response }); }); await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(page.locator('.pos-error[role=alert]')).toBeVisible(); await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(page.getByRole('heading', { name: /VD-/ })).toBeVisible(); const result = await (await page.request.get('/api/v1/pos/sales')).json(); expect(result.total).toBe(1); });
test('permissão de câmera recusada informa alternativa manual', async ({ page }) => { const f = await seed(page); await f.open(); await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }); }); await page.goto('/pdv'); await page.getByRole('button', { name: 'Leitor (câmera)', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Permissão da câmera recusada'); await page.getByRole('button', { name: 'Fechar câmera', exact: true }).first().click(); await expect(page.getByLabel('Câmera para leitura de código de barras')).toHaveCount(0); });
test('leitura contínua bloqueia duplicação e libera vídeo ao sair', async ({ page }) => { const f = await seed(page); await f.open(); await page.addInitScript(() => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; const paint = () => { const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 320, 240); }; paint(); setInterval(paint, 60); const stream = canvas.captureStream(10); (window as any).__camera = stream; Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => stream }); (window as any).BarcodeDetector = class {
    static async getSupportedFormats() { return ['ean_13']; }
    async detect() { return [{ rawValue: '4006381333931' }]; }
}; }); await page.goto('/pdv'); await page.getByRole('button', { name: 'Leitor (câmera)', exact: true }).click(); await expect(page.getByLabel('Quantidade de ' + product.name, { exact: true })).toHaveValue('1'); await page.waitForTimeout(600); await expect(page.getByLabel('Quantidade de ' + product.name, { exact: true })).toHaveValue('1'); await page.getByRole('button', { name: 'Continuar leitura', exact: true }).click(); await expect(page.getByLabel('Quantidade de ' + product.name, { exact: true })).toHaveValue('2'); await page.getByRole('link', { name: 'Caixa', exact: true }).click(); expect(await page.evaluate(() => (window as any).__camera.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true); });
for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]])
    test('PDV responsivo ' + width, async ({ page }) => { const f = await seed(page); await f.open(); await page.setViewportSize({ width, height }); await page.goto('/pdv'); await page.getByRole('button', { name: /1001 · Mercearia/ }).click(); await expect(page.getByText('Carrinho da venda', { exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await page.screenshot({ path: '.local/screenshots/pdv-' + width + '.png', fullPage: true }); });
test('leitor alternativo decodifica EAN do vídeo sem BarcodeDetector', async ({ page }) => {
    const f = await seed(page);
    await f.open();
    const digits = '4006381333931', patterns = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const parity = 'LGLLGG';
    const invert = (s: string) => s.replace(/[01]/g, c => c === '0' ? '1' : '0');
    let bits = '101';
    for (let i = 1; i <= 6; i++) {
        const l = patterns[Number(digits[i])]!;
        bits += parity[i - 1] === 'L' ? l : invert(l).split('').reverse().join('');
    }
    bits += '01010';
    for (let i = 7; i < 13; i++)
        bits += invert(patterns[Number(digits[i])]!);
    bits += '101';
    await page.addInitScript((bits: string) => { Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true }); Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { const c = document.createElement('canvas'); c.width = 460; c.height = 240; const x = c.getContext('2d')!; const paint = () => { x.fillStyle = 'white'; x.fillRect(0, 0, 460, 240); x.fillStyle = 'black'; for (let i = 0; i < bits.length; i++)
            if (bits[i] === '1')
                x.fillRect(40 + i * 4, 30, 4, 180); }; paint(); const timer = setInterval(paint, 60), stream = c.captureStream(15); (window as any).__camera = stream; stream.getTracks()[0]!.addEventListener('ended', () => clearInterval(timer)); return stream; } }); }, bits);
    await page.goto('/pdv');
    await page.getByRole('button', { name: 'Leitor (câmera)', exact: true }).click();
    await expect(page.getByLabel('Quantidade de ' + product.name, { exact: true })).toHaveValue('1', { timeout: 15000 });
    await page.getByRole('button', { name: 'Fechar câmera', exact: true }).first().click();
    expect(await page.evaluate(() => (window as any).__camera.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
});

test('perfil sem PDV não consulta vendas ou caixa',async({page})=>{const user=await createE2EUser({isolatedTenant:true});await page.request.post('/api/v1/auth/login',{data:{email:user.email,password:user.password},headers:{Origin:origin}});await page.goto('/pdv');await expect(page.getByText('Seu perfil não permite consultar o PDV.',{exact:true})).toBeVisible();expect((await page.request.get('/api/v1/pos/sales')).status()).toBe(403);});

test('mesmo código de caixa pode iniciar outro turno sem reutilizar abertura antiga',async({page})=>{const f=await seed(page);await page.goto('/caixa');await page.getByLabel('Fundo de abertura (R$)',{exact:true}).fill('100');await page.getByRole('button',{name:'Abrir caixa',exact:true}).click();await expect(page.getByRole('status')).toContainText('Caixa aberto');const before=await (await page.request.get('/api/v1/pos/overview')).json();await page.getByRole('button',{name:'Fechar caixa conferido',exact:true}).click();await expect(page.getByRole('status')).toContainText('Caixa fechado');await page.getByRole('button',{name:'Abrir caixa',exact:true}).click();await expect(page.getByRole('status')).toContainText('Caixa aberto');const after=await (await page.request.get('/api/v1/pos/overview')).json();expect(after.activeRegister.id).not.toBe(before.activeRegister.id);const registers=await (await page.request.get('/api/v1/pos/registers')).json();expect(registers.total).toBe(2);});

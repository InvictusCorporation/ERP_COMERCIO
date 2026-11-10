import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createE2EUser } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
const supplier = {
    legalName: "Distribuidora Alpha Ltda.",
    name: "Distribuidora Alpha",
    cnpj: "12ABC34501DE35",
    stateRegistration: "",
    contactName: "Equipe comercial",
    email: "alpha@example.invalid",
    phone: "",
    address: "",
    city: "Fortaleza",
    state: "CE",
    postalCode: "",
    deliveryDays: 3,
    paymentTerms: "28 dias",
    notes: "Fornecedor fictício para teste",
    active: true,
};
const product = {
    code: "1001",
    name: "Arroz Tipo 1 - 5 kg",
    description: "",
    category: "Mercearia",
    brand: "Marca teste",
    baseUnit: "UN",
    packageName: "Fardo",
    packageFactor: "10",
    barcodes: [],
    salePrice: "5",
    desiredMargin: "30",
    minimumMargin: "20",
    minimumStock: "20",
    idealStock: "100",
    active: true,
};
async function seed(page: any, withAccount = true) {
    const user = await createE2EUser({
        mfaRequired: true, isolatedTenant: true, isolateAuthIpCounters: true
    });
    let r = await page.request.post("/api/v1/auth/login", {
        data: {
            email: user.email, password: user.password
        },
        headers: {
            Origin: origin
        },
    });
    expect(r.status()).toBe(200);
    let s = await r.json();
    r = await page.request.post("/api/v1/auth/mfa/enroll", {
        data: {},
        headers: {
            Origin: origin, "X-CSRF-Token": s.csrf
        },
    });
    expect(r.status()).toBe(200);
    const setup = await r.json();
    r = await page.request.post("/api/v1/auth/mfa/verify", {
        data: {
            code: totp(setup.secret, user.email).generate()
        },
        headers: {
            Origin: origin, "X-CSRF-Token": s.csrf
        },
    });
    expect(r.status()).toBe(200);
    s = await r.json();
    const post = async (path: string, data: any) => {
        const r = await page.request.post("/api/v1/" + path, {
            data,
            headers: {
                Origin: origin, "X-CSRF-Token": s.csrf
            },
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
    await post("auth/unit", {
        unitId: company.matrixId
    });
    const today = (await (await page.request.get('/api/v1/finance/overview')).json()).today;
    const createAccount = (name: string, extra: any = {}) => post('finance/accounts/save', {
        unitId: company.matrixId, name, kind: 'cash', openingDate: today, openingAmount: '100', active: true, requestKey: randomUUID(), ...extra
    });
    const cash = withAccount ? (await createAccount('Caixa principal')).id : null;
    const createTitle = (extra: any = {}) => post('finance/titles/save', {
        unitId: company.matrixId, kind: 'receivable', counterparty: 'Cliente exemplo', description: 'Venda a prazo', category: 'Vendas', reference: 'REF-01', notes: '', issueDate: today, dueDate: today, amount: '120', installments: 1, intervalDays: 30, requestKey: randomUUID(), ...extra
    });
    const purchase = async () => {
        const p = await post('inventory/products/save', product), sup = await post('purchasing/suppliers/save', supplier);
        const o = await post('purchasing/orders/save', {
            unitId: company.matrixId, supplierId: sup.id, items: [{
                    productId: p.id, quantity: '2', unitCost: '3', packaged: false
                }], freight: '0.01', extraCost: '0', discount: '0', expectedDate: today, notes: 'Compra fictícia para financeiro', requestKey: randomUUID()
        });
        let d = await (await page.request.get('/api/v1/purchasing/orders/' + o.id)).json();
        await post('purchasing/orders/transition', {
            id: o.id, version: d.order.version, action: 'approve', reason: ''
        });
        d = await (await page.request.get('/api/v1/purchasing/orders/' + o.id)).json();
        const r = await post('purchasing/receipts', {
            orderId: o.id, version: d.order.version, items: [{
                    lineId: d.order.items[0].id, quantity: '2'
                }], document: 'REC-FIN-UI', notes: 'Conferência física de teste', requestKey: randomUUID()
        });
        return {
            order: o, receipt: r
        };
    };
    return {
        post, today, company, cash, createAccount, createTitle, purchase
    };
}
async function createByUI(page: any, kind: 'payable' | 'receivable' = 'receivable', amount = '120', installments = 1) {
    await page.goto(kind === 'payable' ? '/contas-a-pagar' : '/contas-a-receber');
    await page.getByRole('button', {
        name: kind === 'payable' ? 'Nova conta a pagar' : 'Nova conta a receber', exact: true
    }).click();
    await page.getByLabel(kind === 'payable' ? 'Fornecedor / favorecido' : 'Cliente / pagador', {
        exact: true
    }).fill('Comércio Exemplo');
    await page.getByLabel('Descrição', {
        exact: true
    }).fill('Parcela comercial de teste');
    await page.getByLabel('Valor total (R$)', {
        exact: true
    }).fill(amount);
    await page.getByLabel('Parcelas', {
        exact: true
    }).fill(String(installments));
    await page.getByRole('button', {
        name: 'Salvar título', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Título registrado');
}
async function openFirst(page: any) {
    await page.getByRole('button', {
        name: /Abrir título FI-/
    }).first().click();
    await expect(page.getByRole('heading', {
        name: /FI-/
    })).toBeVisible();
}
test('sem sessão financeiro redireciona para login; perfil sem acesso não consulta contas', async ({ page }) => {
    await page.goto('/financeiro');
    await expect(page).toHaveURL(/login/);
    const u = await createE2EUser({
        isolatedTenant: true
    });
    await page.request.post('/api/v1/auth/login', {
        data: {
            email: u.email, password: u.password
        }, headers: {
            Origin: origin
        }
    });
    await page.goto('/financeiro');
    await expect(page.getByText('Seu perfil não permite consultar o financeiro.', {
        exact: true
    })).toBeVisible();
    expect((await page.request.get('/api/v1/finance/accounts')).status()).toBe(403);
});
test('cadastro de conta e parcelas usa centavos exatos sem baixar caixa', async ({ page }) => {
    const f = await seed(page, false);
    await page.goto('/caixa-financeiro');
    await page.getByRole('button', {
        name: 'Nova conta', exact: true
    }).click();
    await page.getByLabel('Nome da conta', {
        exact: true
    }).fill('Caixa principal');
    await page.getByLabel('Saldo inicial (R$)', {
        exact: true
    }).fill('100');
    await page.getByRole('button', {
        name: 'Salvar conta', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Conta financeira registrada');
    await createByUI(page, 'payable', '100.01', 3);
    const data = await (await page.request.get('/api/v1/finance/titles?kind=payable')).json();
    expect(data.total).toBe(3);
    expect(data.items.reduce((s: number, t: any) => s + Math.round(Number(t.amount) * 100), 0)).toBe(10001);
    expect(Number((await (await page.request.get('/api/v1/finance/overview')).json()).summary.balance)).toBe(100);
});
test('recebimento parcial considera juros, encargos e desconto', async ({ page }) => {
    const f = await seed(page);
    await createByUI(page);
    await page.getByRole('combobox', {
        name: 'Conta da baixa', exact: true
    }).selectOption(f.cash!);
    await page.getByLabel('Principal (R$)', {
        exact: true
    }).fill('40');
    await page.getByLabel('Juros (R$)', {
        exact: true
    }).fill('2');
    await page.getByLabel('Multa / encargos (R$)', {
        exact: true
    }).fill('1');
    await page.getByLabel('Desconto (R$)', {
        exact: true
    }).fill('3');
    await page.getByRole('button', {
        name: 'Confirmar recebimento manual', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Baixa manual registrada');
    const d = await (await page.request.get('/api/v1/finance/overview')).json();
    expect(Number(d.summary.balance)).toBe(140);
    expect(Number(d.summary.receivable)).toBe(80);
    await expect(page.locator('.fin-status.partial').first()).toBeVisible();
});
test('pagamento reduz saldo e estorno permite cancelar preservando histórico', async ({ page }) => {
    const f = await seed(page);
    await f.createTitle({
        kind: 'payable', amount: '30', description: 'Despesa teste'
    });
    await page.goto('/financeiro');
    await openFirst(page);
    await page.getByRole('combobox', {
        name: 'Conta da baixa', exact: true
    }).selectOption(f.cash!);
    await page.getByRole('button', {
        name: 'Confirmar pagamento manual', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Baixa manual registrada');
    expect(Number((await (await page.request.get('/api/v1/finance/overview')).json()).summary.balance)).toBe(70);
    await page.getByLabel('Motivo para estorno ou cancelamento', {
        exact: true
    }).fill('Correção supervisionada da baixa');
    await page.getByRole('button', {
        name: 'Estornar baixa', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Baixa estornada');
    await page.getByLabel('Motivo para estorno ou cancelamento', {
        exact: true
    }).fill('Título cancelado após correção');
    await page.getByRole('button', {
        name: 'Cancelar título', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Título cancelado');
    await expect(page.getByText('Estornada', {
        exact: false
    }).first()).toBeVisible();
    expect(Number((await (await page.request.get('/api/v1/finance/overview')).json()).summary.balance)).toBe(100);
});
test('insuficiência de caixa mantém título sem baixa', async ({ page }) => {
    const f = await seed(page);
    await f.createTitle({
        kind: 'payable', amount: '150'
    });
    await page.goto('/financeiro');
    await openFirst(page);
    await page.getByRole('combobox', {
        name: 'Conta da baixa', exact: true
    }).selectOption(f.cash!);
    await page.getByRole('button', {
        name: 'Confirmar pagamento manual', exact: true
    }).click();
    await expect(page.locator('.pos-error[role=alert]')).toContainText('Operação financeira recusada');
    expect(Number((await (await page.request.get('/api/v1/finance/overview')).json()).summary.balance)).toBe(100);
});
test('transferência gera duas pernas e extrato mantém origem', async ({ page }) => {
    const f = await seed(page);
    const bank = await f.createAccount('Banco manual', {
        kind: 'bank', openingAmount: '0'
    });
    await page.goto('/caixa-financeiro');
    await page.getByRole('button', {
        name: /Caixa principal.*Caixa financeiro/
    }).click();
    await page.getByRole('combobox', {
        name: 'Operação de caixa', exact: true
    }).selectOption('transfer');
    await page.getByRole('combobox', {
        name: 'Conta de destino', exact: true
    }).selectOption(bank.id);
    await page.getByLabel('Valor da movimentação (R$)', {
        exact: true
    }).fill('20');
    await page.getByLabel('Motivo da movimentação', {
        exact: true
    }).fill('Depósito entre contas próprias');
    await page.getByRole('button', {
        name: 'Registrar movimentação financeira', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Movimentação financeira registrada');
    await page.getByRole('button', {
        name: 'Fluxo e extrato', exact: true
    }).click();
    await expect(page.getByText('Transferência recebida', {
        exact: true
    })).toBeVisible();
    await expect(page.getByText('Transferência enviada', {
        exact: true
    })).toBeVisible();
    expect(Number((await (await page.request.get('/api/v1/finance/overview')).json()).summary.balance)).toBe(100);
});
test('fechamento registra diferença e reabertura libera novo lançamento', async ({ page }) => {
    await seed(page);
    await page.goto('/caixa-financeiro');
    await page.getByRole('button', {
        name: /Caixa principal.*Caixa financeiro/
    }).click();
    await page.getByLabel('Valor contado (R$)', {
        exact: true
    }).fill('99');
    await page.getByRole('button', {
        name: 'Confirmar fechamento financeiro', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Período fechado');
    await expect(page.getByText(/Diferença:.*1,00/)).toBeVisible();
    await page.getByLabel('Motivo da reabertura', {
        exact: true
    }).fill('Correção autorizada de conferência');
    await page.getByRole('button', {
        name: 'Reabrir período financeiro', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('reaberto');
    await page.getByLabel('Valor da movimentação (R$)', {
        exact: true
    }).fill('5');
    await page.getByLabel('Motivo da movimentação', {
        exact: true
    }).fill('Suprimento após conferência');
    await page.getByRole('button', {
        name: 'Registrar movimentação financeira', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Movimentação financeira registrada');
});
test('recebimento de compra gera uma conta a pagar com origem e bloqueia estorno isolado', async ({ page }) => {
    const f = await seed(page);
    const p = await f.purchase();
    await page.goto('/financeiro');
    await page.getByRole('button', {
        name: 'Compras', exact: true
    }).click();
    await page.getByRole('button', {
        name: 'Gerar conta a pagar', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Conta a pagar vinculada');
    await expect(page.getByText(/Origem: recebimento de compra/)).toBeVisible();
    const d = await (await page.request.get('/api/v1/purchasing/orders/' + p.order.id)).json();
    const result = await page.request.post('/api/v1/purchasing/receipts/reverse', {
        data: {
            id: p.receipt.id, version: d.order.version, reason: 'Tentativa de estorno isolado', requestKey: randomUUID()
        }, headers: {
            Origin: origin, 'X-CSRF-Token': (await (await page.request.get('/api/v1/auth/session')).json()).csrf
        }
    });
    expect(result.status()).toBe(409);
});
test('resposta perdida reutiliza chave e não duplica título', async ({ page }) => {
    await seed(page);
    await page.goto('/contas-a-receber');
    await page.getByRole('button', {
        name: 'Nova conta a receber', exact: true
    }).click();
    await page.getByLabel('Cliente / pagador', {
        exact: true
    }).fill('Cliente conexão');
    await page.getByLabel('Descrição', {
        exact: true
    }).fill('Título com resposta interrompida');
    await page.getByLabel('Valor total (R$)', {
        exact: true
    }).fill('10');
    let dropped = false;
    await page.route('**/api/v1/finance/titles/save', async (r) => {
        const response = await r.fetch();
        if (!dropped) {
            dropped = true;
            await r.abort();
        }
        else
            await r.fulfill({
                response
            });
    });
    await page.getByRole('button', {
        name: 'Salvar título', exact: true
    }).click();
    await expect(page.locator('.pos-error[role=alert]')).toBeVisible();
    await page.getByRole('button', {
        name: 'Salvar título', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Título registrado');
    expect((await (await page.request.get('/api/v1/finance/titles?kind=receivable')).json()).total).toBe(1);
});
test('extrato abre título e registra ajuste de vencimento auditável', async ({ page }) => {
    const f = await seed(page), t = await f.createTitle({
        amount: '10'
    });
    const d = await (await page.request.get('/api/v1/finance/titles/' + t.id)).json();
    await f.post('finance/settlements', {
        titleId: t.id, version: d.title.version, accountId: f.cash, principal: '5', interest: '0', fee: '0', discount: '0', postedDate: f.today, method: 'pix', reference: 'REC-05', notes: '', requestKey: randomUUID()
    });
    await page.goto('/financeiro');
    await page.getByRole('button', {
        name: 'Fluxo e extrato', exact: true
    }).click();
    await page.getByRole('button', {
        name: 'Ver título', exact: true
    }).click();
    await page.getByText('Ajustar vencimento e observações', {
        exact: true
    }).click();
    await page.getByLabel('Observações do título', {
        exact: true
    }).fill('Negociação registrada na conferência');
    await page.getByRole('button', {
        name: 'Salvar ajuste', exact: true
    }).click();
    await expect(page.getByRole('status')).toContainText('Vencimento e observações atualizados');
    const updated = await (await page.request.get('/api/v1/finance/titles/' + t.id)).json();
    expect(updated.title.notes).toBe('Negociação registrada na conferência');
});
test('pagamentos simulados do PDV não entram no financeiro manual', async ({ page }) => {
    const f = await seed(page, false), p = await f.post('inventory/products/save', product);
    await f.post('inventory/movements', {
        unitId: f.company.matrixId, productId: p.id, kind: 'entry', quantity: '2', cost: '3', packaged: false, reason: 'Saldo fictício PDV', requestKey: randomUUID()
    });
    const reg = await f.post('pos/registers/open', {
        unitId: f.company.matrixId, code: 'PDV-01', openingAmount: '100', requestKey: randomUUID()
    });
    const sale = await f.post('pos/sales/save', {
        registerId: reg.id, items: [{
                productId: p.id, quantity: '1', expectedPrice: '5'
            }], discount: '0', notes: '', requestKey: randomUUID()
    });
    const sd = await (await page.request.get('/api/v1/pos/sales/' + sale.id)).json();
    const payment = await f.post('pos/payments', {
        saleId: sale.id, version: sd.sale.version, methods: [{
                method: 'cash', amount: '5', tendered: '5'
            }], requestKey: randomUUID()
    });
    await f.post('pos/payments/simulate', {
        paymentId: payment.id, outcome: 'confirmed'
    });
    await page.goto('/caixa-financeiro');
    await expect(page.getByText(/Caixa do PDV permanece em ambiente de teste/)).toBeVisible();
    const overview = await (await page.request.get('/api/v1/finance/overview')).json();
    expect(Number(overview.summary.balance)).toBe(0);
    expect(Number(overview.summary.receivable)).toBe(0);
});
for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 1000]])
    test('financeiro responsivo ' + width, async ({ page }) => {
        const f = await seed(page);
        await f.createTitle({
            kind: 'payable', counterparty: 'Distribuidora Alpha', description: 'Compra de mercadorias', amount: '1200.50'
        });
        await f.createTitle({
            kind: 'payable', counterparty: 'Locadora Exemplo', description: 'Aluguel da loja', amount: '800'
        });
        await f.createTitle({
            counterparty: 'Cliente Exemplo', description: 'Venda a prazo', amount: '240'
        });
        await page.setViewportSize({
            width, height
        });
        await page.goto('/financeiro');
        await expect(page.getByText('Distribuidora Alpha', {
            exact: true
        })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            window.scrollTo(0, 0);
        });
        await page.screenshot({
            path: '.local/qa/financeiro-' + width + '.png', fullPage: true
        });
        await page.getByRole('button', {
            name: /Abrir título FI-/
        }).first().click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
            window.scrollTo(0, 0);
        });
        await page.screenshot({
            path: '.local/qa/financeiro-detalhe-' + width + '.png', fullPage: true
        });
        await page.getByRole('button',{name:'Caixa e contas',exact:true}).click();
        await page.getByRole('button',{name:/Caixa principal.*Caixa financeiro/}).click();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
        await page.screenshot({path:'.local/qa/financeiro-caixa-'+width+'.png',fullPage:true});
        await page.getByRole('button',{name:'Fluxo e extrato',exact:true}).click();
        await expect(page.getByText('Extrato de lançamentos',{exact:true})).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
        await page.screenshot({path:'.local/qa/financeiro-fluxo-'+width+'.png',fullPage:true});

    });

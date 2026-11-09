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
async function seed(page: any, withSupplier = true) {
  const user = await createE2EUser({ mfaRequired: true, isolatedTenant: true });
  let r = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  let s = await r.json();
  r = await page.request.post("/api/v1/auth/mfa/enroll", {
    data: {},
    headers: { Origin: origin, "X-CSRF-Token": s.csrf },
  });
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
  const supplierId = withSupplier
    ? (await post("purchasing/suppliers/save", supplier)).id
    : null;
  const create = async (extra: any = {}) =>
    post("purchasing/orders/save", {
      unitId: company.matrixId,
      supplierId,
      items: [
        { productId: p.id, quantity: "100", unitCost: "3", packaged: false },
      ],
      freight: "0",
      extraCost: "0",
      discount: "0",
      expectedDate: "2026-12-10",
      notes: "Pedido fictício de validação",
      requestKey: randomUUID(),
      ...extra,
    });
  const detail = async (id: string) =>
    (await page.request.get("/api/v1/purchasing/orders/" + id)).json();
  const approve = async (id: string) => {
    const d = await detail(id);
    return post("purchasing/orders/transition", {
      id,
      version: d.order.version,
      action: "approve",
      reason: "",
    });
  };
  return { post, company, p, supplierId, create, detail, approve };
}
async function openOrder(page: any, number: string) {
  await page
    .getByRole("row")
    .filter({ hasText: number })
    .getByRole("button")
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Detalhes da compra" })
      .getByRole("heading", { name: number, exact: true }),
  ).toBeVisible();
}

test("fornecedor cadastra, pesquisa, edita e preserva CNPJ após recarga", async ({
  page,
}) => {
  await seed(page, false);
  await page.goto("/fornecedores");
  await page
    .getByRole("button", { name: "Novo fornecedor", exact: true })
    .click();
  await page
    .getByLabel("Razão social *", { exact: true })
    .fill(supplier.legalName);
  await page.getByLabel("Nome fantasia *", { exact: true }).fill(supplier.name);
  await page.getByLabel("CNPJ *", { exact: true }).fill(supplier.cnpj);
  await page
    .getByLabel("Condições de pagamento", { exact: true })
    .fill("28 dias");
  await page
    .getByRole("button", { name: "Salvar fornecedor", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Fornecedor salvo");
  await expect(page.getByLabel("CNPJ *", { exact: true })).toBeDisabled();
  await page.reload();
  await page.getByLabel("Buscar fornecedores", { exact: true }).fill("Alpha");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: /Distribuidora Alpha/ }).click();
  await expect(
    page.getByLabel("Condições de pagamento", { exact: true }),
  ).toHaveValue("28 dias");
  await page
    .getByLabel("Pessoa de contato", { exact: true })
    .fill("Contato atualizado");
  await page
    .getByRole("button", { name: "Salvar fornecedor", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Fornecedor salvo");
});

test("pedido criado na tela aprova e recebe parcialmente até concluir com estoque correto", async ({
  page,
}) => {
  const f = await seed(page);
  await page.goto("/compras");
  await page.getByRole("button", { name: "Novo pedido", exact: true }).click();
  await page
    .getByLabel("Fornecedor da compra", { exact: true })
    .selectOption(f.supplierId);
  await page
    .getByLabel("Produto para adicionar", { exact: true })
    .selectOption(f.p.id);
  await page
    .getByRole("button", { name: "Adicionar produto", exact: true })
    .click();
  await page
    .getByLabel("Quantidade pedida de " + product.name, { exact: true })
    .fill("100");
  await page
    .getByLabel("Custo de " + product.name, { exact: true })
    .fill("3,00");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  await page
    .getByRole("button", { name: "Aprovar pedido", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Pedido aprovado");
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page
    .getByLabel("Quantidade conferida de " + product.name, { exact: true })
    .fill("40");
  await page
    .getByLabel("Referência do recebimento", { exact: true })
    .fill("REC-001");
  await page
    .getByLabel("Observações da conferência", { exact: true })
    .fill("Primeira entrega conferida");
  await page
    .getByRole("button", { name: "Confirmar recebimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Recebimento confirmado",
  );
  await expect(page.locator(".purchase-status")).toContainText(
    "Recebido parcialmente",
  );
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Preencher quantidades pendentes",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Quantidade conferida de " + product.name, { exact: true }),
  ).toHaveValue("60.000");
  await page
    .getByLabel("Referência do recebimento", { exact: true })
    .fill("REC-002");
  await page
    .getByLabel("Observações da conferência", { exact: true })
    .fill("Saldo entregue e conferido");
  await page
    .getByRole("button", { name: "Confirmar recebimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Recebimento confirmado",
  );
  const r = await page.request.get(
    "/api/v1/inventory/products/" + f.p.id + "?unitId=" + f.company.matrixId,
  );
  const d = await r.json();
  expect(Number(d.product.stock.physical)).toBe(100);
  expect(Number(d.product.stock.value)).toBe(300);
  await page.reload();
  await page.getByRole("button", { name: /Distribuidora Alpha/ }).click();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.locator(".inv-history article")).toHaveCount(2);
});

test("estorno pelo recebimento recompõe pedido e mantém o histórico", async ({
  page,
}) => {
  const f = await seed(page);
  const order = await f.create();
  await f.approve(order.id);
  let d = await f.detail(order.id);
  await f.post("purchasing/receipts", {
    orderId: order.id,
    version: d.order.version,
    items: [{ lineId: d.order.items[0].id, quantity: "10" }],
    document: "REC-ESTORNO",
    notes: "Conferência inicial",
    requestKey: randomUUID(),
  });
  d = await f.detail(order.id);
  await page.goto("/compras");
  await openOrder(page, d.order.number);
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page
    .getByLabel("Motivo do estorno REC-ESTORNO", { exact: true })
    .fill("Lançamento conferido na unidade errada");
  await page
    .getByRole("button", { name: "Estornar recebimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Recebimento estornado");
  await expect(page.locator(".inv-history article").first()).toContainText(
    "Estornado",
  );
  const r = await page.request.get(
    "/api/v1/inventory/products/" + f.p.id + "?unitId=" + f.company.matrixId,
  );
  expect(Number((await r.json()).product.stock.physical)).toBe(0);
});

test("cancelamento exige motivo e filtro encontra o pedido cancelado", async ({
  page,
}) => {
  const f = await seed(page),
    o = await f.create(),
    d = await f.detail(o.id);
  await page.goto("/compras");
  await openOrder(page, d.order.number);
  await page
    .getByLabel("Motivo do cancelamento", { exact: true })
    .fill("Pedido duplicado identificado");
  await page
    .getByRole("button", { name: "Cancelar pedido", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Pedido cancelado");
  await page
    .getByLabel("Situação das compras", { exact: true })
    .selectOption("cancelled");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: d.order.number }),
  ).toContainText("Cancelado");
});

test("falha de conexão mantém cadastro de fornecedor para tentar novamente", async ({
  page,
}) => {
  const f = await seed(page);
  await page.goto("/fornecedores");
  await page.getByRole("button", { name: /Distribuidora Alpha/ }).click();
  await page
    .getByLabel("Pessoa de contato", { exact: true })
    .fill("Contato revisado");
  await page.route("**/api/v1/purchasing/suppliers/save", (r) =>
    r.abort("failed"),
  );
  await page
    .getByRole("button", { name: "Salvar fornecedor", exact: true })
    .click();
  await expect(page.locator(".purchasing-module [role=alert]")).toContainText(
    "Não foi possível conectar",
  );
  await expect(
    page.getByLabel("Pessoa de contato", { exact: true }),
  ).toHaveValue("Contato revisado");
  await page.unroute("**/api/v1/purchasing/suppliers/save");
  await page
    .getByRole("button", { name: "Salvar fornecedor", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Fornecedor salvo");
});

test("sem permissão não mostra fornecedores nem compras por URL direta", async ({
  page,
}) => {
  const u = await createE2EUser({ isolatedTenant: true });
  await page.request.post("/api/v1/auth/login", {
    data: { email: u.email, password: u.password },
    headers: { Origin: origin },
  });
  await page.goto("/fornecedores");
  await expect(
    page.getByRole("heading", {
      name: "Consulta de fornecedores não autorizada",
    }),
  ).toBeVisible();
  await page.goto("/compras");
  await expect(
    page.getByRole("heading", { name: "Consulta de compras não autorizada" }),
  ).toBeVisible();
});

async function settleCapture(page: any) {
  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "instant" });
            resolve();
          }),
        ),
      ),
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}
function cnpj(prefix: string) {
  const digit = (s: string) => {
    let sum = 0,
      w = 2;
    for (let i = s.length - 1; i >= 0; i--) {
      sum += Number(s[i]) * w;
      w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    return String(r < 2 ? 0 : 11 - r);
  };
  return prefix + digit(prefix) + digit(prefix + digit(prefix));
}
for (const width of [360, 390, 768, 1440])
  test(
    "fornecedores e compras responsivos em " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: width < 650 ? 844 : 1000 });
      const f = await seed(page);
      for (const [index, name] of [
        "Distribuidora Beta",
        "Atacado Horizonte",
        "Comercial Fortaleza",
      ].entries())
        await f.post("purchasing/suppliers/save", {
          ...supplier,
          name,
          legalName: name + " Ltda.",
          cnpj: cnpj(String(112223330001 + index)),
          contactName: "Comercial " + (index + 1),
          deliveryDays: index + 2,
        });
      const o = await f.create({ freight: "30" });
      await f.approve(o.id);
      let d = await f.detail(o.id);
      await f.post("purchasing/receipts", {
        orderId: o.id,
        version: d.order.version,
        items: [{ lineId: d.order.items[0].id, quantity: "40" }],
        document: "CONFERÊNCIA 001",
        notes: "Entrega parcial conferida pela equipe",
        requestKey: randomUUID(),
      });
      await f.create({
        freight: "40",
        items: [
          { productId: f.p.id, quantity: "50", unitCost: "4", packaged: true },
        ],
      });
      d = await f.detail(o.id);
      await page.goto("/fornecedores");
      await page.getByRole("button", { name: /Distribuidora Alpha/ }).click();
      await expect(
        page.getByLabel("Nome fantasia *", { exact: true }),
      ).toHaveValue(supplier.name);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await settleCapture(page);
      await page.screenshot({
        path: ".local/qa/fornecedores-" + width + ".png",
        fullPage: true,
      });
      await page.goto("/compras");
      await openOrder(page, d.order.number);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await settleCapture(page);
      await page.screenshot({
        path: ".local/qa/compras-" + width + ".png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Receber", exact: true }).click();
      await expect(
        page.getByLabel("Quantidade conferida de " + product.name, {
          exact: true,
        }),
      ).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await settleCapture(page);
      await page.screenshot({
        path: ".local/qa/compras-recebimento-" + width + ".png",
        fullPage: true,
      });
    },
  );

test("recebimento com margem baixa avisa e preserva o preço vigente", async ({
  page,
}) => {
  const f = await seed(page);
  const o = await f.create({
    items: [
      { productId: f.p.id, quantity: "1", unitCost: "10", packaged: false },
    ],
  });
  await f.approve(o.id);
  const d = await f.detail(o.id);
  await page.goto("/compras");
  await openOrder(page, d.order.number);
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Preencher quantidades pendentes",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Referência do recebimento", { exact: true })
    .fill("REC-MARGEM");
  await page
    .getByLabel("Observações da conferência", { exact: true })
    .fill("Nova entrada com aumento de custo");
  await page
    .getByRole("button", { name: "Confirmar recebimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Recebimento confirmado",
  );
  await expect(
    page.getByRole("note", { name: "Alertas de margem" }),
  ).toContainText("Preço sugerido");
  const r = await page.request.get(
    "/api/v1/inventory/products/" + f.p.id + "?unitId=" + f.company.matrixId,
  );
  expect(Number((await r.json()).product.salePrice)).toBe(5);
  await page.goto("/auditoria");
  await page
    .getByRole("row")
    .filter({ hasText: "Pedido de compra criado" })
    .getByRole("button", { name: /Detalhes do evento/ })
    .click();
  const audit = page.getByRole("complementary", {
    name: "Detalhes da auditoria",
  });
  await expect(
    audit.getByRole("row").filter({ hasText: "Itens e quantidades" }),
  ).toContainText(product.name);
  await expect(audit).toContainText("Custo unitário: 10");
});

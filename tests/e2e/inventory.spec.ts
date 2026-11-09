import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createE2EUser } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
const product = {
  code: "1001",
  name: "Arroz Tipo 1 - 5 kg",
  description: "Produto fictício para teste",
  category: "Mercearia",
  brand: "Marca Exemplo",
  baseUnit: "UN",
  packageName: "Fardo",
  packageFactor: "10",
  barcodes: ["4006381333931"],
  salePrice: "5.00",
  desiredMargin: "30",
  minimumMargin: "20",
  minimumStock: "20",
  idealStock: "100",
  active: true,
};
async function seed(page: any, withProduct = true) {
  const user = await createE2EUser({ mfaRequired: true, isolatedTenant: true });
  let r = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  let session = await r.json();
  r = await page.request.post("/api/v1/auth/mfa/enroll", {
    data: {},
    headers: { Origin: origin, "X-CSRF-Token": session.csrf },
  });
  const setup = await r.json();
  r = await page.request.post("/api/v1/auth/mfa/verify", {
    data: { code: totp(setup.secret, user.email).generate() },
    headers: { Origin: origin, "X-CSRF-Token": session.csrf },
  });
  expect(r.status()).toBe(200);
  session = await r.json();
  const post = async (path: string, data: any) => {
    const r = await page.request.post("/api/v1/" + path, {
      data,
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const company = await post("organizations/companies/save", {
    legalName: "Supermercado Exemplo Ltda.",
    tradeName: "Supermercado Exemplo",
    cnpj: "12ABC34501DE35",
    matrixCode: "MAT",
    active: true,
  });
  await post("auth/unit", { unitId: company.matrixId });
  let p: any;
  if (withProduct) {
    p = await post("inventory/products/save", product);
    for (const cost of ["3", "4"])
      await post("inventory/movements", {
        unitId: company.matrixId,
        productId: p.id,
        kind: "entry",
        quantity: "100",
        packaged: false,
        cost,
        reason: "Entrada fictícia para validação",
        requestKey: randomUUID(),
      });
  }
  return { post, p, company, session };
}
async function choose(page: any) {
  await page.getByRole("button", { name: /Arroz Tipo 1/ }).click();
  await expect(
    page.getByLabel("Nome do produto *", { exact: true }),
  ).toHaveValue(product.name);
}

test("cadastra produto, busca por GTIN e mantém alterações após recarregar", async ({
  page,
}) => {
  await seed(page, false);
  await page.goto("/produtos");
  await expect(page.getByText("Seu catálogo começa aqui")).toBeVisible();
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  await page.getByLabel("Código interno *", { exact: true }).fill("1001");
  await page
    .getByLabel("Nome do produto *", { exact: true })
    .fill(product.name);
  await page.getByLabel("Categoria", { exact: true }).fill("Mercearia");
  await page.getByLabel("Preço de venda (R$) *", { exact: true }).fill("5,00");
  await page
    .getByLabel("Códigos de barras GTIN/EAN", { exact: true })
    .fill("4006381333931");
  await page
    .getByLabel("Códigos de barras GTIN/EAN", { exact: true })
    .press("End");
  await page
    .getByLabel("Códigos de barras GTIN/EAN", { exact: true })
    .press("Enter");
  await page
    .getByLabel("Códigos de barras GTIN/EAN", { exact: true })
    .pressSequentially("96385074");
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Produto salvo");
  await page.reload();
  await page
    .getByLabel("Buscar produtos", { exact: true })
    .fill("4006381333931");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await choose(page);
  await expect(
    page.getByLabel("Códigos de barras GTIN/EAN", { exact: true }),
  ).toHaveValue("4006381333931\n96385074");
  await expect(
    page.getByLabel("Código interno *", { exact: true }),
  ).toBeDisabled();
});

test("entrada e reserva atualizam saldos; histórico mostra responsável e permite estorno", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/produtos");
  await choose(page);
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await expect(page.locator(".inv-balances")).toContainText("200");
  await page
    .getByLabel("Tipo de movimento", { exact: true })
    .selectOption("reserve");
  await page.getByLabel("Quantidade", { exact: true }).fill("10");
  await page
    .getByLabel("Motivo do movimento", { exact: true })
    .fill("Reserva autorizada de teste");
  await page
    .getByRole("button", { name: "Confirmar movimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Movimento confirmado");
  await expect(page.locator(".inv-balances")).toContainText("190");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.locator(".inv-history article").first()).toContainText(
    "Reserva autorizada de teste",
  );
  await expect(page.locator(".inv-history article").first()).toContainText(
    "Operador de teste",
  );
  await page
    .getByLabel("Motivo do estorno", { exact: true })
    .fill("Reserva cancelada pelo responsável");
  await page
    .getByRole("button", { name: "Estornar último movimento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Movimento confirmado");
  await expect(page.locator(".inv-balances")).toContainText("200");
});

test("limites por unidade geram alerta persistente e filtram estoque baixo", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/estoque");
  await choose(page);
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await page
    .getByLabel("Estoque mínimo da unidade", { exact: true })
    .fill("200");
  await page
    .getByLabel("Estoque ideal da unidade", { exact: true })
    .fill("300");
  await page
    .getByRole("button", { name: "Salvar limites da unidade", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Limites desta unidade atualizados",
  );
  await expect(
    page.getByText("Estoque atingiu o mínimo", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Situação dos produtos", { exact: true })
    .selectOption("low");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("button", { name: /Arroz Tipo 1/ })).toHaveCount(
    1,
  );
});

test("falha de conexão preserva a edição e permite tentar novamente", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/produtos");
  await choose(page);
  await page
    .getByLabel("Nome do produto *", { exact: true })
    .fill("Arroz atualizado");
  await page.route("**/api/v1/inventory/products/save", (route) =>
    route.abort("failed"),
  );
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.locator(".inventory-module [role=alert]")).toContainText(
    "Não foi possível conectar",
  );
  await expect(
    page.getByLabel("Nome do produto *", { exact: true }),
  ).toHaveValue("Arroz atualizado");
  await page.unroute("**/api/v1/inventory/products/save");
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Produto salvo");
});

test("usuário sem permissão não recebe o catálogo", async ({ page }) => {
  const user = await createE2EUser({ isolatedTenant: true });
  await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  await page.goto("/produtos");
  await expect(
    page.getByRole("heading", { name: "Consulta de produtos não autorizada" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo produto" })).toHaveCount(
    0,
  );
});

for (const width of [360, 390, 768, 1440])
  test(
    "produtos e estoque responsivos em " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: width < 650 ? 844 : 1000 });
      const f = await seed(page);
      for (const [index, name] of [
        "Feijão Carioca - 1 kg",
        "Açúcar Refinado - 1 kg",
        "Óleo de Soja - 900 ml",
        "Leite Integral - 1 L",
      ].entries()) {
        const p = await f.post("inventory/products/save", {
          ...product,
          code: String(1002 + index),
          name,
          barcodes: [],
          salePrice: ["8.49", "5.49", "8.49", "4.99"][index],
        });
        await f.post("inventory/movements", {
          unitId: f.company.matrixId,
          productId: p.id,
          kind: "entry",
          quantity: String(30 + index * 15),
          packaged: false,
          cost: "3",
          reason: "Carga fictícia para validação visual",
          requestKey: randomUUID(),
        });
      }
      await page.goto("/produtos");
      await choose(page);
      await expect(page.locator(".inv-margin")).toContainText("R$");
      await expect(
        page.getByLabel("Preço de venda (R$) *", { exact: true }),
      ).toHaveValue("5.00");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/qa/produtos-" + width + ".png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Estoque", exact: true }).click();
      await expect(page.locator(".inv-balances")).toContainText("200");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: ".local/qa/estoque-" + width + ".png",
        fullPage: true,
      });
    },
  );

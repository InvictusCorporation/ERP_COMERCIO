import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createE2EUser } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
function testCnpj(base: string) {
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let value = base;
  for (const offset of [1, 0]) {
    const remainder =
      [...value].reduce(
        (n, c, i) => n + (c.charCodeAt(0) - 48) * weights[i + offset],
        0,
      ) % 11;
    value += remainder < 2 ? "0" : String(11 - remainder);
  }
  return value;
}
async function ownerLogin(page: any) {
  const user = await createE2EUser({ mfaRequired: true, isolatedTenant: true });
  let r = await page.request.post(origin + "/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  let session = await r.json();
  r = await page.request.post(origin + "/api/v1/auth/mfa/enroll", {
    data: {},
    headers: { Origin: origin, "X-CSRF-Token": session.csrf },
  });
  const setup = await r.json();
  r = await page.request.post(origin + "/api/v1/auth/mfa/verify", {
    data: { code: totp(setup.secret, user.email).generate() },
    headers: { Origin: origin, "X-CSRF-Token": session.csrf },
  });
  expect(r.status()).toBe(200);
  session = await r.json();
  return { user, session };
}
async function fixture(page: any, session: any) {
  const root = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const post = async (path: string, body: any) => {
    const r = await page.request.post(origin + "/api/v1/" + path, {
      data: body,
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const company = await post("organizations/companies/save", {
    legalName: "Comércio Aurora de Teste Ltda.",
    tradeName: "Comércio Aurora",
    cnpj: testCnpj(root + "0001"),
    matrixCode: "MAT-01",
    active: true,
  });
  const createUnit = (
    kind: string,
    code: string,
    name: string,
    parent = company.matrixId,
  ) =>
    post("organizations/units/save", {
      companyId: company.id,
      parentId: parent,
      kind,
      code,
      name,
      cnpj: null,
      active: true,
    });
  const branch = await createUnit("filial", "LOJA-01", "Loja Centro");
  const north = await createUnit("filial", "LOJA-02", "Loja Norte");
  const cd = await createUnit("cd", "CD-01", "Distribuição Principal");
  const depot = await createUnit(
    "deposito",
    "DEP-01",
    "Depósito da Loja Centro",
    branch.id,
  );
  return { company, branch, north, cd, depot };
}
test("cadastro visual cria empresa, matriz e filial com persistência", async ({
  page,
}) => {
  await ownerLogin(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/empresas");
  await page.getByRole("button", { name: "Nova empresa", exact: true }).click();
  await page
    .getByLabel("Razão social", { exact: true })
    .fill("Empresa Exemplo de Teste Ltda.");
  await page
    .getByLabel("Nome fantasia", { exact: true })
    .fill("Empresa Exemplo");
  await page
    .getByLabel("CNPJ da empresa", { exact: true })
    .fill(
      testCnpj(
        "99AB" +
          randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase() +
          "0001",
      ),
    );
  await page.getByLabel("Código da matriz", { exact: true }).fill("MATRIZ-01");
  await page.getByLabel("Cidade", { exact: true }).fill("Fortaleza");
  await page.getByLabel("UF", { exact: true }).selectOption("CE");
  await page
    .getByRole("button", { name: "Salvar empresa", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Empresa salva");
  await expect(
    page.getByRole("button", {
      name: "Editar empresa Empresa Exemplo",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova unidade", exact: true }).click();
  await page.getByLabel("Código da unidade", { exact: true }).fill("FILIAL-01");
  await page
    .getByLabel("Nome da unidade", { exact: true })
    .fill("Filial Beira Mar");
  await page
    .getByRole("button", { name: "Salvar unidade", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Unidade salva");
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Editar unidade Filial Beira Mar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("combobox", { name: "Unidade", exact: true })
      .getByRole("option", { name: /Filial Beira Mar/ }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("CNPJ inválido mantém formulário e exibe erro claro", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/empresas");
  await page.getByRole("button", { name: "Nova empresa", exact: true }).click();
  await page
    .getByLabel("Razão social", { exact: true })
    .fill("Empresa Inválida Teste");
  await page
    .getByLabel("Nome fantasia", { exact: true })
    .fill("Empresa Inválida");
  await page
    .getByLabel("CNPJ da empresa", { exact: true })
    .fill("00000000000000");
  await page.getByLabel("Código da matriz", { exact: true }).fill("MAT");
  await page
    .getByRole("button", { name: "Salvar empresa", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Estrutura de empresas e unidades" })
      .getByRole("alert"),
  ).toContainText("CNPJ");
  await expect(page.getByLabel("Razão social", { exact: true })).toHaveValue(
    "Empresa Inválida Teste",
  );
});
test("permissão por filial configurada na interface limita a navegação do operador", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const { user, session } = await ownerLogin(page);
  const structure = await fixture(page, session);
  const employee = await createE2EUser({ tenantId: user.tenantId });
  await page.goto("/usuarios");
  await page.getByLabel("Buscar usuários").fill(employee.email);
  await page
    .getByRole("button", { name: "Editar Operador de teste", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Escopo de acesso", exact: true })
    .selectOption("selected");
  await page.getByRole("checkbox", { name: /^Loja Centro/ }).check();
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Acesso atualizado");
  const context = await browser.newContext();
  const operator = await context.newPage();
  try {
    const r = await operator.request.post(origin + "/api/v1/auth/login", {
      data: { email: employee.email, password: employee.password },
      headers: { Origin: origin },
    });
    const signed = await r.json();
    expect(signed.units.map((u: any) => u.id)).toEqual([structure.branch.id]);
    await operator.goto(origin + "/empresas");
    await expect(
      operator.getByRole("button", {
        name: "Ver unidade Loja Centro",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      operator.getByRole("button", {
        name: "Ver unidade Loja Norte",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      operator.getByRole("button", { name: "Nova empresa", exact: true }),
    ).toHaveCount(0);
    const forbidden = await operator.request.get(
      origin + "/api/v1/organizations/units/" + structure.north.id,
    );
    expect(forbidden.status()).toBe(404);
    await operator
      .getByRole("combobox", { name: "Unidade", exact: true })
      .selectOption(structure.branch.id);
    await operator.reload();
    await expect(
      operator.getByRole("combobox", { name: "Unidade", exact: true }),
    ).toHaveValue(structure.branch.id);
  } finally {
    await context.close();
  }
});
test("inativação de empresa bloqueia contexto e reativação preserva estrutura", async ({
  page,
}) => {
  const { session } = await ownerLogin(page);
  const structure = await fixture(page, session);
  await page.goto("/empresas");
  await page
    .getByRole("combobox", { name: "Unidade", exact: true })
    .selectOption(structure.branch.id);
  await page
    .getByRole("button", {
      name: "Editar empresa Comércio Aurora",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Situação do cadastro", exact: true })
    .selectOption("inactive");
  await page
    .getByRole("button", { name: "Salvar empresa", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Empresa salva");
  await expect(
    page.getByRole("combobox", { name: "Unidade", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Editar empresa Comércio Aurora",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Situação do cadastro", exact: true })
    .selectOption("active");
  await page
    .getByRole("button", { name: "Salvar empresa", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Empresa salva");
  await expect(
    page.getByRole("combobox", { name: "Unidade", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Editar unidade Depósito da Loja Centro",
      exact: true,
    }),
  ).toBeVisible();
});
for (const width of [360, 390, 768, 1440])
  test(
    "estrutura organizacional responsiva em " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const { session } = await ownerLogin(page);
      await fixture(page, session);
      await page.goto("/empresas");
      await expect(
        page.getByRole("button", {
          name: "Editar unidade Loja Centro",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width <= 1250)
        await expect(
          page.getByRole("combobox", {
            name: "Unidade para operação",
            exact: true,
          }),
        ).toBeVisible();
      await page
        .getByRole("button", { name: "Nova unidade", exact: true })
        .click();
      await expect(
        page.getByLabel("Nome da unidade", { exact: true }),
      ).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({
        path: ".local/qa/empresas-" + width + ".png",
        fullPage: true,
        caret: "initial",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    },
  );

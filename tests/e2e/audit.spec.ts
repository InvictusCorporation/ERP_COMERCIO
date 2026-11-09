import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createE2EUser } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
async function signIn(client: any, user: any, mfa = false) {
  let r = await client.post(origin + "/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  let session = await r.json();
  if (mfa) {
    r = await client.post(origin + "/api/v1/auth/mfa/enroll", {
      data: {},
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
    });
    const setup = await r.json();
    r = await client.post(origin + "/api/v1/auth/mfa/verify", {
      data: { code: totp(setup.secret, user.email).generate() },
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
    });
    expect(r.status()).toBe(200);
    session = await r.json();
  }
  return session;
}
async function seed(page: any) {
  const user = await createE2EUser({ mfaRequired: true, isolatedTenant: true });
  const session = await signIn(page.request, user, true);
  const post = async (path: string, body: any) => {
    const r = await page.request.post("/api/v1/" + path, {
      data: body,
      headers: { Origin: origin, "X-CSRF-Token": session.csrf },
    });
    expect(r.status()).toBe(200);
    return { data: await r.json(), requestId: r.headers()["x-request-id"] };
  };
  const body = {
    legalName: "Comércio de Teste Ltda.",
    tradeName: "Comércio Inicial",
    cnpj: "12ABC34501DE35",
    matrixCode: "MAT-01",
    active: true,
  };
  const company = await post("organizations/companies/save", body);
  const updated = await post("organizations/companies/save", {
    ...body,
    id: company.data.id,
    tradeName: "Comércio Atualizado",
    city: "Fortaleza",
  });
  const unitA = await post("organizations/units/save", {
    companyId: company.data.id,
    parentId: company.data.matrixId,
    kind: "filial",
    code: "LOJA-A",
    name: "Loja Centro",
    cnpj: null,
    active: true,
  });
  const unitB = await post("organizations/units/save", {
    companyId: company.data.id,
    parentId: company.data.matrixId,
    kind: "filial",
    code: "LOJA-B",
    name: "Loja Norte",
    cnpj: null,
    active: true,
  });
  return { user, session, company, updated, unitA, unitB, post };
}
async function openCompanyChange(page: any) {
  const row = page.getByRole("row").filter({ hasText: "Empresa alterada" });
  await row.getByRole("button", { name: /Detalhes do evento/ }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Detalhes da auditoria" })
      .getByRole("heading", { name: "Empresa alterada", exact: true }),
  ).toBeVisible();
}
test("histórico mostra responsável, antes e depois e filtra a mesma operação", async ({
  page,
}) => {
  const fixture = await seed(page);
  await page.goto("/auditoria");
  await openCompanyChange(page);
  const detail = page.getByRole("complementary", {
    name: "Detalhes da auditoria",
  });
  await expect(
    detail.getByRole("row").filter({ hasText: "Nome fantasia" }),
  ).toContainText("Comércio Inicial");
  await expect(
    detail.getByRole("row").filter({ hasText: "Nome fantasia" }),
  ).toContainText("Comércio Atualizado");
  await expect(
    detail.getByText("Operador de teste", { exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Ver eventos da mesma operação" })
    .click();
  await expect(
    page.getByRole("button", { name: "Remover filtro da operação" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Empresa alterada" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Remover filtro da operação" })
    .click();
  await page.getByLabel("Buscar no histórico").fill("Comércio Atualizado");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Empresa alterada" }),
  ).toHaveCount(1);
});
test("operador consulta sua segurança sem receber histórico administrativo da rede", async ({
  page,
}) => {
  const user = await createE2EUser({ isolatedTenant: true });
  await signIn(page.request, user);
  await page.goto("/auditoria");
  await expect(
    page.getByRole("button", { name: "Minha segurança", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Histórico da rede", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Senha de acesso validada" }),
  ).toBeVisible();
  const response = await page.request.get("/api/v1/audit/events?scope=network");
  expect(response.status()).toBe(403);
});
test("histórico por filial não mostra unidade alheia e revogação afeta consulta aberta", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const f = await seed(page);
  const employee = await createE2EUser({ tenantId: f.user.tenantId });
  await f.post("access/roles/save", {
    name: "Auditor restrito",
    permissions: ["audit.read", "organizations.read"],
  });
  const access = await (
    await page.request.get("/api/v1/access/overview")
  ).json();
  const role = access.roles.find((r: any) => r.name === "Auditor restrito"),
    member = access.members.find((m: any) => m.email === employee.email);
  await f.post("access/members/change", {
    id: member.id,
    roleId: role.id,
    active: true,
    allUnits: false,
    unitIds: [f.unitA.data.id],
  });
  const context = await browser.newContext();
  const viewer = await context.newPage();
  try {
    await signIn(viewer.request, employee, true);
    await viewer.goto(origin + "/auditoria");
    await expect(
      viewer.getByRole("row").filter({ hasText: "Loja Centro" }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("row").filter({ hasText: "Loja Norte" }),
    ).toHaveCount(0);
    await expect(
      viewer.getByRole("row").filter({ hasText: "Comércio Inicial" }),
    ).toHaveCount(0);
    await f.post("access/members/change", {
      id: member.id,
      roleId: role.id,
      active: true,
      allUnits: false,
      unitIds: [f.unitB.data.id],
    });
    await viewer.getByRole("button", { name: "Atualizar histórico" }).click();
    await expect(
      viewer.getByRole("row").filter({ hasText: "Loja Norte" }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("row").filter({ hasText: "Loja Centro" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("erro de período é claro e filtros podem ser limpos", async ({ page }) => {
  await seed(page);
  await page.goto("/auditoria");
  await page.getByLabel("Data inicial do histórico").fill("2026-12-01");
  await page.getByLabel("Data final do histórico").fill("2026-01-01");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Consulta de auditoria" })
      .getByRole("alert"),
  ).toContainText("Data inicial");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Empresa alterada" }),
  ).toBeVisible();
});
test("indisponibilidade do histórico mantém mensagem de conexão e não apresenta registros", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/api/v1/audit/**", (route) => route.abort());
  await page.goto("/auditoria");
  await expect(
    page.getByRole("heading", { name: "Histórico indisponível" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Consulta de auditoria" })
      .getByRole("alert"),
  ).toContainText("Não foi possível conectar");
  await expect(
    page.getByRole("button", { name: /Detalhes do evento/ }),
  ).toHaveCount(0);
});
for (const width of [360, 390, 768, 1440])
  test(
    "auditoria responsiva com comparação em " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await seed(page);
      await page.goto("/auditoria");
      await openCompanyChange(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      await page.screenshot({
        path: ".local/qa/auditoria-" + width + ".png",
        fullPage: true,
        caret: "initial",
      });
      await page
        .getByRole("button", { name: "Fechar detalhes da auditoria" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cada alteração tem uma história." }),
      ).toBeVisible();
    },
  );

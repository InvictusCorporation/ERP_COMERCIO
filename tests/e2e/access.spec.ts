import { test, expect } from "@playwright/test";
import { createE2EUser, latestE2ERecovery } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
const origin = "http://127.0.0.1:3001";
async function ownerLogin(page: any) {
  const user = await createE2EUser({ mfaRequired: true });
  let r = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  const session = await r.json();
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
  return user;
}
test("operador recebe negação por URL direta e menu não oferece administração", async ({
  page,
}) => {
  const user = await createE2EUser();
  await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: origin },
  });
  await page.goto("/usuarios");
  await expect(
    page.getByRole("heading", { name: "Acesso indisponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo usuário", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Usuários e permissões", exact: true }),
  ).toHaveCount(0);
});
test("proprietário convida pessoa, acompanha aceite e suspende o vínculo", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000); // Fluxo completo com duas sessões de navegador e compilação local.
  await ownerLogin(page);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo usuário", exact: true }).click();
  const name = "Pessoa convidada E2E";
  const email = "invite-" + Date.now() + "@example.invalid";
  await page.getByLabel("Nome completo", { exact: true }).fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Enviar convite", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Convite preparado");
  const msg = await latestE2ERecovery(email);
  const context = await browser.newContext();
  const invited = await context.newPage();
  try {
    await invited.goto(msg);
    await expect(invited.getByText(email, { exact: false })).toBeVisible();
    await invited
      .getByLabel("Crie sua senha")
      .fill("Senha fictícia convite 2026!");
    await invited
      .getByLabel("Confirme a senha")
      .fill("Senha fictícia convite 2026!");
    await invited
      .getByRole("button", { name: "Aceitar convite", exact: true })
      .click();
    await expect(
      invited.getByRole("heading", { name: "Você faz parte da equipe." }),
    ).toBeVisible();
    expect(await invited.evaluate(() => location.hash)).toBe("");
  } finally {
    await context.close();
  }
  await page.getByRole("button", { name: "Atualizar usuários" }).click();
  await page.getByLabel("Buscar usuários").fill(name);
  await page
    .getByRole("button", { name: "Editar " + name, exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Situação", exact: true })
    .selectOption("suspended");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Acesso atualizado");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: "Editar " + name, exact: true }),
    });
  await expect(row).toContainText("Suspenso");
});
test("perfil personalizado persiste e não oferece privilégio Master", async ({
  page,
}) => {
  await ownerLogin(page);
  await page.goto("/permissoes");
  await page.getByRole("button", { name: "Novo perfil", exact: true }).click();
  const name = "Consulta E2E " + Date.now();
  await page.getByLabel("Nome do perfil").fill(name);
  await page
    .getByLabel("Consultar usuários e perfis", { exact: false })
    .check();
  await expect(page.getByLabel("Master", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Perfil salvo");
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});
for (const width of [360, 390, 768, 1440])
  test("administração responsiva em " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await ownerLogin(page);
    await page.goto("/usuarios");
    await page
      .getByRole("button", { name: "Novo usuário", exact: true })
      .click();
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/qa/usuarios-" + width + ".png",
      fullPage: true,
      caret: "initial",
    });
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", { name: "Perfis e permissões", exact: true })
      .click();
    await expect(page.getByText("Proprietário", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

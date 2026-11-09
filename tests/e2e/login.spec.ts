import { test, expect } from "@playwright/test";
import { createE2EUser, latestE2ERecovery } from "../support/e2e-context.mjs";
import { totp } from "../../apps/api/dist/modules/identity/crypto.js";
test("segurança no celular mantém e-mail legível e encerra todas as sessões", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await createE2EUser();
  const response = await page.request.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password },
    headers: { Origin: "http://127.0.0.1:3001" },
  });
  expect(response.status()).toBe(200);
  await page.goto("/seguranca");
  await expect(
    page.getByText("Este dispositivo", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/qa/seguranca-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Encerrar todas as sessões" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
async function fillLogin(page: any, user: { email: string; password: string }) {
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
}
test("sem sessão o painel redireciona para login; senha visível só quando solicitada", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Acesse sua conta" }),
  ).toBeVisible();
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Somente teste ficticio");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
});
test("login real, cookie HttpOnly, painel protegido e logout", async ({
  page,
  context,
}) => {
  const user = await createE2EUser();
  await page.goto("/login");
  await fillLogin(page, user);
  await expect(
    page.getByRole("heading", { name: "Dashboard administrativo" }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === "invictus_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(
    await page.evaluate(() => document.cookie.includes("invictus_session")),
  ).toBe(false);
  await page.goto("/seguranca");
  await expect(
    page.getByRole("heading", { name: "Acesso e segurança" }),
  ).toBeVisible();
  await expect(
    page.getByText("Este dispositivo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair deste dispositivo" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
test("recuperação e redefinição com link somente no fragmento", async ({
  page,
}) => {
  const user = await createE2EUser();
  await page.goto("/recuperar-acesso");
  await page.getByLabel("E-mail cadastrado").fill(user.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(
    page.getByRole("heading", { name: "Confira seu e-mail" }),
  ).toBeVisible();
  await page.goto(await latestE2ERecovery(user.email));
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("Nova senha ficticia para browser 2026!");
  await page
    .getByLabel("Confirme a nova senha")
    .fill("Nova senha ficticia para browser 2026!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(
    page.getByRole("heading", { name: "Senha redefinida" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao login" }).click();
  await fillLogin(page, {
    ...user,
    password: "Nova senha ficticia para browser 2026!",
  });
  await expect(
    page.getByRole("heading", { name: "Dashboard administrativo" }),
  ).toBeVisible();
});
test("primeiro administrador completa MFA antes do painel", async ({
  page,
}) => {
  const user = await createE2EUser({ mfaRequired: true });
  await page.goto("/login");
  await fillLogin(page, user);
  await expect(page).toHaveURL(/\/verificar-acesso$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/verificar-acesso$/);
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(
    page.getByRole("img", {
      name: "QR Code para configurar o aplicativo autenticador",
    }),
  ).toBeVisible();
  await page.getByText("Não consegue ler o QR Code?").click();
  const secret = await page.locator(".mfa-setup code").innerText();
  await page
    .getByLabel("Código de autenticação", { exact: true })
    .fill(totp(secret, user.email).generate());
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard administrativo" }),
  ).toBeVisible();
});
test("falha de conexão é tratada sem liberar o painel", async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) => route.abort());
  await page.goto("/login");
  await fillLogin(page, {
    email: "network@example.invalid",
    password: "Senha ficticia para teste 2026!",
  });
  await expect(page.locator('.auth-error[role="alert"]')).toContainText(
    "Não foi possível conectar",
  );
  await expect(
    page.getByRole("button", { name: "Entrar no sistema" }),
  ).toBeEnabled();
});
for (const width of [360, 390, 768, 1440])
  test(`telas de acesso em ${width}px sem overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/recuperar-acesso", "/redefinir-senha"]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".auth-card")).toBeVisible();
    }
  });

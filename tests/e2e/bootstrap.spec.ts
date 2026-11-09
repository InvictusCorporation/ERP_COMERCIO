import { test, expect } from "@playwright/test";
test("menu mobile mantém foco e fecha por Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const open = page.getByRole("button", { name: "Abrir menu" });
  await open.click();
  const menu = page.getByRole("dialog", { name: "Menu do ERP" });
  const close = menu.getByRole("button", { name: "Fechar menu" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    menu.getByRole("button", { name: "Configurações", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(open).toBeFocused();
});
test("dashboard vazio, navegação e status real da API", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard administrativo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vendas e PDV" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Sua história começa aqui" }),
  ).toBeVisible();
  await expect(
    page.locator(".connection").getByText("Conectada", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Acompanhar implantação" }).click();
  await expect(
    page.getByRole("heading", { name: "Fundação do sistema", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("INCREMENTO 01.6")).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ambiente e configurações" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verificar conexões" }).click();
  await expect(
    page.getByRole("button", { name: "Verificar conexões" }),
  ).toBeEnabled({ timeout: 15000 });
});
test("ajuda acessível com fechamento por Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ajuda sobre esta versão" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ajuda sobre esta versão" }),
  ).toBeFocused();
});
test("API indisponível não aparece como conectada", async ({ page }) => {
  await page.route("**/api/v1/health/**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.locator(".connection").getByText("Indisponível", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".connection").getByText("Não conectado", { exact: true }),
  ).toBeVisible();
});
for (const width of [360, 390, 768, 1440]) {
  test(`layout responsivo em ${width}px sem overflow e menu utilizável`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard administrativo" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width < 760) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page
        .getByRole("button", { name: "Configurações", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Ambiente e configurações" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Abrir menu" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });
}

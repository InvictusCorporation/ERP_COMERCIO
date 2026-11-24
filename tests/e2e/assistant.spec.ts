import { test, expect, type Page } from '@playwright/test';
import { createE2EUser } from '../support/e2e-context.mjs';
import { totp } from '../../apps/api/dist/modules/identity/crypto.js';
const origin = 'http://127.0.0.1:3001';
async function seed(page: Page, owner = true) {
  const user = await createE2EUser({ mfaRequired: owner, isolatedTenant: true, isolateAuthIpCounters: true });
  let r = await page.request.post('/api/v1/auth/login', { data: { email: user.email, password: user.password }, headers: { Origin: origin } });
  expect(r.status()).toBe(200); let session = await r.json();
  if (owner) {
    const enrolled = await page.request.post('/api/v1/auth/mfa/enroll', { data: {}, headers: { Origin: origin, 'X-CSRF-Token': session.csrf } }); const mfa = await enrolled.json();
    r = await page.request.post('/api/v1/auth/mfa/verify', { data: { code: totp(mfa.secret, user.email).generate() }, headers: { Origin: origin, 'X-CSRF-Token': session.csrf } }); expect(r.status()).toBe(200); session = await r.json();
  }
  const post = async (path: string, data: unknown) => { const r = await page.request.post('/api/v1/' + path, { data, headers: { Origin: origin, 'X-CSRF-Token': session.csrf } }); const v = await r.json(); expect(r.status(), JSON.stringify(v)).toBe(200); return v; };
  if (!owner) return { branch: '' };
  const co = await post('organizations/companies/save', { legalName: 'Comércio Exemplo do Assistente', tradeName: 'Supermercado Exemplo', cnpj: '11222333000181', matrixCode: 'MAT', active: true });
  const branch = await post('organizations/units/save', { companyId: co.id, parentId: co.matrixId, kind: 'filial', code: 'CENTRO', name: 'Loja Centro', cnpj: null, active: true });
  await post('auth/unit', { unitId: co.matrixId });
  return { branch: branch.id as string };
}
async function prepare(page: Page) {
  await page.getByRole('button', { name: /Estoque e reposição/ }).click();
  await page.getByRole('button', { name: 'Preparar pergunta', exact: true }).click();
  await expect(page.getByText('Rascunho preparado · IA desconectada', { exact: true })).toBeVisible();
}
test('assistente exige sessão e permissão de consulta gerencial', async ({ page }) => {
  await page.goto('/assistente'); await expect(page).toHaveURL(/login/);
  await seed(page, false); await page.goto('/assistente');
  await expect(page.getByText('Seu perfil não permite acessar a IA gerencial.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assistente inteligente', exact: true })).toHaveCount(0);
});
for (const width of [1440, 390]) {
  test(`assistente prepara rascunho sem IA em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const f = await seed(page);
    await page.goto('/assistente'); await prepare(page);
    await expect(page.locator('.assistant-response')).toContainText('Nenhuma análise foi gerada');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ animations: 'disabled', path: `.local/assistant-${width}.png`, fullPage: true });
    await page.getByRole('combobox', { name: 'Filial da análise', exact: true }).selectOption(f.branch);
    await expect(page.getByText('Rascunho preparado · IA desconectada', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Pergunta para o assistente', exact: true })).toHaveValue('');
    await prepare(page); await expect(page.locator('.assistant-response')).toContainText('Loja Centro');
    await page.reload(); await expect(page.getByRole('button', { name: /Estoque e reposição/ })).toBeVisible();
    await expect(page.getByText('Rascunho preparado · IA desconectada', { exact: true })).toHaveCount(0);
  });
}
test('falha ao atualizar remove temas e rascunho anterior', async ({ page }) => {
  await seed(page); await page.goto('/assistente'); await prepare(page);
  await page.route('**/api/v1/assistant/overview', route => route.abort());
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.locator('.assistant-root').getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(page.locator('.assistant-response')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Estoque e reposição/ })).toHaveCount(0);
});

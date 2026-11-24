import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authDatabase } from '../support/auth-database.mjs';
import { AppModule } from '../../apps/api/dist/app.module.js';
import { createApplication } from '../../apps/api/dist/application.js';
import { encrypt, newMfaSecret, totp } from '../../apps/api/dist/modules/identity/crypto.js';

test('Assistente: rascunhos sem IA, permissões e isolamento por filial', async t => {
  const f = await authDatabase(); let app, url, owner, normal, unit, branch, today;
  const request = async (path, session, input, extra = {}) => {
    const r = await fetch(url + path, { method: input === undefined ? 'GET' : 'POST',
      headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json', Origin: f.config.origin }), ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.data.csrf } : {}), ...extra }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  const get = (p, s = owner) => request(p, s), post = (p, v, s = owner, h = {}) => request(p, s, v, h);
  const ok = async (p, v, s = owner) => { const r = await post(p, v, s); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const login = async (user, mfa = false) => {
    let secret;
    if (mfa) { secret = newMfaSecret(); await f.admin.query('UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2', [encrypt(secret, f.key), user.id]); }
    let s = await post('auth/login', { email: user.email, password: user.password }, null);
    if (secret) s = await post('auth/mfa/verify', { code: totp(secret, user.email).generate() }, s);
    assert.equal(s.status, 200); return s;
  };
  const input = (extra = {}) => ({ topic: 'stock', unitId: unit, from: today, to: today, question: 'Quais produtos precisam de reposição?', ...extra });
  try {
    app = await createApplication(AppModule.register(f.appUrl, f.config), false); await app.listen(0, '127.0.0.1'); url = (await app.getUrl()) + '/api/v1/';
    owner = await login(f.users.owner, true); normal = await login(f.users.normal);
    const company = await ok('organizations/companies/save', { legalName: 'Empresa teste do assistente', tradeName: 'Empresa teste', cnpj: '11222333000181', matrixCode: 'MAT', active: true });
    unit = company.matrixId; branch = (await ok('organizations/units/save', { companyId: company.id, parentId: unit, kind: 'filial', code: 'FIL', name: 'Filial teste', cnpj: null, active: true })).id;
    await ok('auth/unit', { unitId: unit });
    today = (await get('assistant/overview')).data.today;
    await f.admin.query('UPDATE identity.memberships SET is_owner=true WHERE tenant_id=$1 AND user_id=$2', [f.tenantB, f.users.other.id]);
    const other = await login(f.users.other, true);
    const foreign = await ok('organizations/companies/save', { legalName: 'Empresa de outra rede', tradeName: 'Outra rede', cnpj: '11222333000181', matrixCode: 'MAT', active: true }, other);
    await t.test('sessão e perfil são obrigatórios e não há provedor habilitado', async () => {
      assert.equal((await get('assistant/overview', null)).status, 401);
      assert.equal((await get('assistant/overview', normal)).status, 403);
      const r = await get('assistant/overview'); assert.equal(r.status, 200);
      assert.equal(r.data.provider, null); assert.equal(r.data.state, 'disabled'); assert.equal(r.data.topics.length, 5);
      assert.deepEqual(r.data.units.map(u => u.id).sort(), [unit, branch].sort());
    });
    await t.test('rascunho não gera resposta, escrita financeira ou histórico persistente', async () => {
      const count = async () => (await f.admin.query('SELECT (SELECT count(*) FROM finance.entries)::int finance,(SELECT count(*) FROM inventory.movements)::int stock,(SELECT count(*) FROM audit.events)::int audit')).rows[0];
      const before = await count(); const r = await post('assistant/draft', input());
      assert.equal(r.status, 200); assert.equal(r.data.state, 'draft'); assert.equal(r.data.generatedAnswer, null); assert.equal(r.data.sentToProvider, false);
      assert.equal(r.data.unitId, unit); assert.equal(r.data.question, input().question); assert.equal('tenantId' in r.data, false);
      assert.deepEqual(await count(), before);
    });
    await t.test('filial existente de outra rede não entra no contexto nem aceita rascunho', async () => {
      assert.equal((await post('assistant/draft', input({ unitId: foreign.matrixId }))).status, 404);
      const own = await get('assistant/overview');
      assert.ok(!own.data.units.some(u => u.id === foreign.matrixId));
      assert.ok(!JSON.stringify(own.data).includes('Outra rede'));
    });
    await t.test('origem, CSRF, payload e filial inexistente não ampliam acesso', async () => {
      assert.equal((await post('assistant/draft', input(), owner, { Origin: 'https://external.invalid' })).status, 403);
      assert.equal((await post('assistant/draft', input(), owner, { 'X-CSRF-Token': 'invalid' })).status, 403);
      for (const extra of [{ tenantId: f.tenantB }, { execute: true }, { model: 'external' }, { topic: '__proto__' }, { question: 'x'.repeat(2001) }, { from: '2026-02-30' }]) assert.equal((await post('assistant/draft', input(extra))).status, 400);
      assert.equal((await post('assistant/draft', input({ unitId: randomUUID() }))).status, 404);
      assert.equal((await post('assistant/analyze', input())).status, 404);
    });
    await t.test('permissões de origem e restrição por filial valem na API', async () => {
      await ok('access/roles/save', { name: 'Assistente financeiro restrito', permissions: ['organizations.read', 'reports.read', 'finance.read'] });
      const roleId = (await f.admin.query('SELECT id FROM access.roles WHERE tenant_id=$1 AND name=$2', [f.tenantA, 'Assistente financeiro restrito'])).rows[0].id;
      const member = (await f.admin.query('SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2', [f.tenantA, f.users.normal.id])).rows[0].id;
      await ok('access/members/change', { id: member, roleId, active: true, allUnits: false, unitIds: [branch] });
      const r = await get('assistant/overview', normal); assert.equal(r.status, 200);
      assert.deepEqual(r.data.units.map(u => u.id), [branch]); assert.deepEqual(r.data.topics.map(t => t.id), ['finance']);
      assert.equal((await post('assistant/draft', input({ unitId: branch, topic: 'finance' }), normal)).status, 200);
      assert.equal((await post('assistant/draft', input({ unitId: branch }), normal)).status, 403);
      assert.equal((await post('assistant/draft', input(), normal)).status, 404);
      await ok('access/members/change', { id: member, roleId, active: false, allUnits: false, unitIds: [branch] });
      assert.equal((await get('assistant/overview', normal)).status, 403);
    });
    await t.test('bloqueio comercial de relatórios também bloqueia o assistente', async () => {
      await f.admin.query('INSERT INTO commercial.operators(user_id) VALUES($1)', [f.users.owner.id]);
      const plan = (await get('commercial/plans')).data.find(p => p.name === 'Essencial');
      await ok('commercial/subscriptions', { tenantId: f.tenantA, planId: plan.id, planVersion: plan.version, version: 0, enabledModules: ['inventory'], state: 'active', startsOn: today, endsOn: today, reason: 'Restrição comercial de teste' });
      assert.equal((await get('assistant/overview')).status, 403);
      assert.equal((await post('assistant/draft', input())).status, 403);
    });
  } finally { if (app) await app.close(); await f.admin.end(); }
});

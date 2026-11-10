import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  newMfaSecret,
  encrypt,
  totp,
  decrypt,
} from "../../apps/api/dist/modules/identity/crypto.js";
import {
  TenantDatabase,
  TenantAccessDenied,
} from "../../apps/api/dist/database/tenant-database.js";
const makeCnpj = (base) => {
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let result = base;
  for (const offset of [1, 0]) {
    const remainder =
      [...result].reduce(
        (n, c, i) => n + (c.charCodeAt(0) - 48) * weights[i + offset],
        0,
      ) % 11;
    result += remainder < 2 ? "0" : String(11 - remainder);
  }
  return result;
};
const fields = {
  stateRegistration: "ISENTO",
  email: "org@example.invalid",
  phone: "",
  address: "Rua de teste, 100",
  city: "Fortaleza",
  state: "CE",
  postalCode: "60000000",
  active: true,
};
test(
  "Organizações reais: estrutura, CNPJ e autorização por filial",
  { timeout: 120000 },
  async (t) => {
    const f = await authDatabase();
    let app = await createApplication(
      AppModule.register(f.appUrl, f.config),
      false,
    );
    await app.listen(0, "127.0.0.1");
    let url = (await app.getUrl()) + "/api/v1/";
    const database = new TenantDatabase(f.appUrl, 2);
    async function req(
      path,
      { session, body, csrf = true, origin = f.config.origin } = {},
    ) {
      const r = await fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: origin }),
          ...(session
            ? {
                Cookie: session.cookie,
                ...(csrf ? { "X-CSRF-Token": session.data.csrf } : {}),
              }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const post = (path, session, body) => req(path, { session, body });
    async function login(u, mfa = false) {
      if (!mfa)
        return req("auth/login", {
          body: { email: u.email, password: u.password },
        });
      const secret = newMfaSecret();
      await f.admin.query(
        "UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2",
        [encrypt(secret, f.key), u.id],
      );
      let s = await req("auth/login", {
        body: { email: u.email, password: u.password },
      });
      return post("auth/mfa/verify", s, {
        code: totp(secret, u.email).generate(),
      });
    }
    const saveCompany = (session, overrides = {}) =>
      post("organizations/companies/save", session, {
        ...fields,
        legalName: "Empresa Fictícia de Testes A Ltda.",
        tradeName: "Rede de Testes",
        cnpj: makeCnpj("99AA00010001"),
        matrixCode: "MATRIZ-A",
        ...overrides,
      });
    const saveUnit = (session, overrides = {}) =>
      post("organizations/units/save", session, {
        companyId: companyA,
        parentId: matrixA,
        kind: "filial",
        code: "LOJA-1",
        name: "Loja Centro",
        cnpj: makeCnpj("99AA00010002"),
        address: "Rua fictícia",
        city: "Fortaleza",
        state: "CE",
        postalCode: "60000000",
        active: true,
        ...overrides,
      });
    const overview = (s) => req("organizations/overview", { session: s });
    let owner,
      otherOwner,
      operator,
      companyA,
      matrixA,
      companyB,
      matrixB,
      companySecond,
      secondMatrix,
      branch1,
      branch2,
      cd,
      depot,
      operatorRole,
      memberId,
      branch1data;
    try {
      await t.test(
        "API nega anonimato, CSRF, origem e campos arbitrários sem gravar cadastro",
        async () => {
          owner = await login(f.users.owner, true);
          operator = await login(f.users.normal);
          assert.equal(owner.status, 200);
          assert.equal((await req("organizations/overview")).status, 401);
          const body = {
            ...fields,
            legalName: "X",
            tradeName: "X",
            cnpj: makeCnpj("99AA00010001"),
            matrixCode: "M",
          };
          assert.equal(
            (
              await req("organizations/companies/save", {
                session: owner,
                body,
                csrf: false,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await req("organizations/companies/save", {
                session: owner,
                body,
                origin: "https://other.invalid",
              })
            ).status,
            403,
          );
          assert.equal(
            (await saveCompany(owner, { tenantId: f.tenantB })).status,
            400,
          );
          assert.equal(
            (await f.admin.query("SELECT * FROM organizations.companies"))
              .rowCount,
            0,
          );
        },
      );
      await t.test(
        "cadastro cria empresa e matriz atomicamente e preserva CNPJ alfanumérico",
        async () => {
          const result = await saveCompany(owner);
          assert.equal(result.status, 200, JSON.stringify(result.data));
          companyA = result.data.id;
          matrixA = result.data.matrixId;
          const view = (await overview(owner)).data;
          assert.equal(view.companies[0].cnpj, makeCnpj("99AA00010001"));
          assert.equal(view.units[0].kind, "matriz");
          assert.equal(view.units[0].companyId, companyA);
          assert.equal(view.units[0].available, true);
          assert.equal(view.units[0].parentId, null);
        },
      );
      await t.test(
        "valida CNPJ, campos, UF, CEP, código e duplicidade sem alterações parciais",
        async () => {
          for (const invalid of [
            { cnpj: "99AA0001000199" },
            { state: "XX" },
            { postalCode: "123" },
            { matrixCode: "código inválido" },
            { legalName: " " },
          ])
            assert.equal((await saveCompany(owner, invalid)).status, 400);
          assert.equal(
            (await saveCompany(owner, { matrixCode: "MATRIZ-X" })).status,
            409,
          );
          assert.equal(
            (
              await saveCompany(owner, {
                cnpj: makeCnpj("99AA00010002"),
                matrixCode: "MATRIZ-X",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await f.admin.query(
                "SELECT * FROM organizations.companies WHERE tenant_id=$1",
                [f.tenantA],
              )
            ).rowCount,
            1,
          );
        },
      );
      await t.test(
        "cadastra filial, centro de distribuição e depósito vinculado à filial",
        async () => {
          let r = await saveUnit(owner);
          assert.equal(r.status, 200, JSON.stringify(r.data));
          branch1 = r.data.id;
          r = await saveUnit(owner, {
            name: "Loja Norte",
            code: "LOJA-2",
            cnpj: makeCnpj("99AA00010003"),
          });
          assert.equal(r.status, 200);
          branch2 = r.data.id;
          r = await saveUnit(owner, {
            kind: "cd",
            code: "CD-1",
            name: "Distribuição Principal",
            cnpj: null,
          });
          assert.equal(r.status, 200);
          cd = r.data.id;
          r = await saveUnit(owner, {
            kind: "deposito",
            code: "DEP-1",
            name: "Depósito Centro",
            parentId: branch1,
            cnpj: null,
          });
          assert.equal(r.status, 200);
          depot = r.data.id;
          const view = (await overview(owner)).data;
          assert.equal(view.units.length, 5);
          branch1data = view.units.find((u) => u.id === branch1);
        },
      );
      await t.test(
        "duplicidade, segunda matriz, raiz de CNPJ alheia e hierarquia inválida são recusadas",
        async () => {
          assert.equal((await saveUnit(owner)).status, 409);
          assert.equal(
            (
              await saveUnit(owner, {
                code: "OUTRA",
                cnpj: makeCnpj("88BB00020001"),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await saveUnit(owner, {
                code: "MATRIZ-2",
                kind: "matriz",
                parentId: null,
                cnpj: makeCnpj("99AA00010004"),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await saveUnit(owner, {
                code: "NULO",
                parentId: null,
                cnpj: null,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await saveUnit(owner, {
                code: "INVALIDO",
                parentId: depot,
                cnpj: null,
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "outra empresa da rede e outro tenant não permitem vínculos cruzados",
        async () => {
          let r = await saveCompany(owner, {
            legalName: "Segunda PJ fictícia",
            tradeName: "Segunda empresa",
            cnpj: makeCnpj("88BB00020001"),
            matrixCode: "MATRIZ-2",
          });
          assert.equal(r.status, 200);
          companySecond = r.data.id;
          secondMatrix = r.data.matrixId;
          const u = await f.createUser("org-owner-b", {
            tenant: f.tenantB,
            mfaRequired: true,
          });
          otherOwner = await login(u, true);
          r = await saveCompany(otherOwner);
          assert.equal(r.status, 200);
          companyB = r.data.id;
          matrixB = r.data.matrixId;
          assert.equal(
            (
              await saveUnit(owner, {
                code: "CROSS-1",
                parentId: matrixB,
                cnpj: null,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await saveUnit(owner, {
                code: "CROSS-2",
                parentId: secondMatrix,
                cnpj: null,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await saveUnit(owner, {
                code: "CROSS-3",
                companyId: companyB,
                parentId: matrixB,
                cnpj: null,
              })
            ).status,
            404,
          );
          assert.equal(
            (await req("organizations/units/" + matrixB, { session: owner }))
              .status,
            404,
          );
          assert.equal((await overview(owner)).data.companies.length, 2);
        },
      );
      await t.test(
        "código, CNPJ, tipo e vínculos históricos são imutáveis no servidor",
        async () => {
          const { available, ...payload } = branch1data;
          for (const change of [
            { companyId: companySecond, parentId: secondMatrix },
            { kind: "cd" },
            { parentId: cd },
            { code: "NOVO-CODIGO" },
            { cnpj: null },
          ])
            assert.equal(
              (
                await post("organizations/units/save", owner, {
                  ...payload,
                  ...change,
                })
              ).status,
              409,
            );
          const view = (await overview(owner)).data;
          const company = view.companies.find((c) => c.id === companyA);
          assert.equal(
            (
              await post("organizations/companies/save", owner, {
                ...company,
                matrixCode: "MATRIZ-A",
                cnpj: makeCnpj("77CC00030001"),
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "operador consulta mas não altera; proprietário restringe somente à filial escolhida",
        async () => {
          assert.equal((await overview(operator)).status, 200);
          assert.equal(
            (await saveCompany(operator, { matrixCode: "NAO" })).status,
            403,
          );
          const access = (await req("access/overview", { session: owner }))
            .data;
          operatorRole = access.roles.find(
            (r) => r.name === "Operador de caixa",
          );
          memberId = access.members.find(
            (m) => m.email === f.users.normal.email,
          ).id;
          assert.equal(
            (
              await post("access/members/change", owner, {
                id: memberId,
                roleId: operatorRole.id,
                active: true,
                allUnits: false,
                unitIds: [branch1],
              })
            ).status,
            200,
          );
          const view = (await overview(operator)).data;
          assert.deepEqual(
            view.units.map((u) => u.id),
            [branch1],
          );
          assert.deepEqual(
            view.companies.map((c) => c.id),
            [companyA],
          );
          assert.equal(view.canManage, false);
          for (const id of [matrixA, branch2, cd, depot, matrixB, randomUUID()])
            assert.equal(
              (await req("organizations/units/" + id, { session: operator }))
                .status,
              404,
            );
          assert.equal(
            (await req("organizations/units/" + branch1, { session: operator }))
              .status,
            200,
          );
        },
      );
      await t.test(
        "seleção de unidade é persistente e recusa unidade alheia ou consolidado sem escopo global",
        async () => {
          let r = await post("auth/unit", operator, { unitId: branch1 });
          assert.equal(r.status, 200);
          assert.equal(r.data.activeUnitId, branch1);
          assert.equal(r.data.allUnits, false);
          assert.deepEqual(
            r.data.units.map((u) => u.id),
            [branch1],
          );
          assert.equal(
            (await req("auth/session", { session: operator })).data
              .activeUnitId,
            branch1,
          );
          for (const unitId of [branch2, matrixB, null])
            assert.equal(
              (await post("auth/unit", operator, { unitId })).status,
              403,
            );
          assert.equal(
            (await post("auth/unit", owner, { unitId: cd })).status,
            200,
          );
          assert.equal(
            (await post("auth/unit", owner, { unitId: null })).data
              .activeUnitId,
            null,
          );
        },
      );
      await t.test(
        "RLS comercial e withUnit negam filial adulterada, ausência de unidade e empresa alheia",
        async () => {
          const context = { tenantId: f.tenantA, userId: f.users.normal.id };
          await database.withUnit(
            { ...context, unitId: branch1 },
            async (c) => {
              assert.deepEqual(
                (await c.query("SELECT id FROM organizations.units")).rows.map(
                  (u) => u.id,
                ),
                [branch1],
              );
              assert.equal(
                (await c.query("SELECT id FROM organizations.companies"))
                  .rowCount,
                1,
              );
            },
          );
          for (const id of [branch2, depot, matrixB])
            await assert.rejects(
              database.withUnit({ ...context, unitId: id }, async () => {}),
              (e) => e instanceof TenantAccessDenied,
            );
          await database.withTenant(context, async (c) => {
            assert.equal(
              (await c.query("SELECT id FROM organizations.units")).rowCount,
              0,
            );
            assert.equal(
              (await c.query("SELECT id FROM organizations.companies"))
                .rowCount,
              0,
            );
          });
        },
      );
      await t.test(
        "mudar escopo afeta sessão aberta e limpa unidade selecionada sem somar filiais",
        async () => {
          assert.equal(
            (
              await post("access/members/change", owner, {
                id: memberId,
                roleId: operatorRole.id,
                active: true,
                allUnits: false,
                unitIds: [branch2],
              })
            ).status,
            200,
          );
          const current = (await req("auth/session", { session: operator }))
            .data;
          assert.equal(current.activeUnitId, null);
          assert.deepEqual(
            current.units.map((u) => u.id),
            [branch2],
          );
          assert.equal(
            (await req("organizations/units/" + branch1, { session: operator }))
              .status,
            404,
          );
        },
      );
      await t.test(
        "escopos inválidos, unidade estrangeira e proprietário restrito falham com rollback",
        async () => {
          const before = (await req("access/overview", { session: owner }))
            .data;
          for (const scope of [
            { allUnits: false, unitIds: [] },
            { allUnits: false, unitIds: [matrixB] },
            { allUnits: true, unitIds: [branch1] },
            { allUnits: "false", unitIds: [] },
          ])
            assert.equal(
              (
                await post("access/members/change", owner, {
                  id: memberId,
                  roleId: operatorRole.id,
                  active: true,
                  ...scope,
                })
              ).status,
              400,
            );
          const own = before.members.find(
            (m) => m.email === f.users.owner.email,
          );
          assert.equal(
            (
              await post("access/members/change", owner, {
                id: own.id,
                roleId: own.roleId,
                active: true,
                allUnits: false,
                unitIds: [branch1],
              })
            ).status,
            400,
          );
          const after = (await req("access/overview", { session: owner })).data;
          assert.deepEqual(
            after.members.find((m) => m.id === memberId).unitIds,
            [branch2],
          );
        },
      );
      await t.test(
        "perfil administrativo com escopo restrito não administra pessoas ou estrutura global",
        async () => {
          const u = await f.createUser("restricted-admin", {
            secret: newMfaSecret(),
          });
          const access = (await req("access/overview", { session: owner }))
            .data;
          const member = access.members.find((m) => m.email === u.email);
          const role = access.roles.find((r) => r.name === "Administrador");
          assert.equal(
            (
              await post("access/members/change", owner, {
                id: member.id,
                roleId: role.id,
                active: true,
                allUnits: false,
                unitIds: [branch1],
              })
            ).status,
            200,
          );
          const session = await login(u, true);
          assert.equal((await req("access/overview", { session })).status, 403);
          assert.equal((await saveCompany(session)).status, 403);
          assert.deepEqual(
            (await req("auth/session", { session })).data.permissions,
            [
              "organizations.read",
              "audit.read",
              "products.read",
              "stock.read",
              "stock.manage",
              "suppliers.read",
              "purchases.read",
              "purchases.manage",
              "purchases.approve",
              "purchases.receive",
                "pos.read", "pos.sell", "pos.cash", "pos.cash.manage", "pos.discount", "pos.refund",
                "finance.read", "finance.manage", "finance.settle", "finance.reverse", "finance.cash", "fiscal.read", "fiscal.manage", "fiscal.issue", "fiscal.cancel",
                "crm.read","crm.manage","crm.credit","crm.loyalty","orders.read","orders.manage","deliveries.manage",
            ],
          );
        },
      );
      await t.test(
        "inativar filial bloqueia seleção, leitura restrita e depósito descendente; reativação preserva dados",
        async () => {
          const { available, ...payload } = branch1data;
          await post("access/members/change", owner, {
            id: memberId,
            roleId: operatorRole.id,
            active: true,
            allUnits: false,
            unitIds: [branch1, depot],
          });
          assert.equal(
            (await post("auth/unit", operator, { unitId: depot })).status,
            200,
          );
          assert.equal(
            (
              await post("organizations/units/save", owner, {
                ...payload,
                active: false,
              })
            ).status,
            200,
          );
          const current = (await req("auth/session", { session: operator }))
            .data;
          assert.deepEqual(current.units, []);
          assert.equal(current.activeUnitId, null);
          assert.equal(
            (await req("organizations/units/" + depot, { session: operator }))
              .status,
            404,
          );
          await assert.rejects(
            database.withUnit(
              { tenantId: f.tenantA, userId: f.users.normal.id, unitId: depot },
              async () => {},
            ),
            (e) => e instanceof TenantAccessDenied,
          );
          assert.equal(
            (
              await post("organizations/units/save", owner, {
                ...payload,
                active: true,
              })
            ).status,
            200,
          );
          assert.equal(
            (await req("auth/session", { session: operator })).data.units
              .length,
            2,
          );
        },
      );
      await t.test(
        "inativar empresa bloqueia todas suas unidades sem apagá-las",
        async () => {
          const c = (await overview(owner)).data.companies.find(
            (c) => c.id === companyA,
          );
          const payload = { ...c, matrixCode: "MATRIZ-A" };
          assert.equal(
            (
              await post("organizations/companies/save", owner, {
                ...payload,
                active: false,
              })
            ).status,
            200,
          );
          assert.deepEqual(
            (await req("auth/session", { session: operator })).data.units,
            [],
          );
          const view = (await overview(owner)).data;
          assert.ok(
            view.units
              .filter((u) => u.companyId === companyA)
              .every((u) => !u.available),
          );
          assert.equal(
            (await saveUnit(owner, { code: "NAO-ATIVA", cnpj: null })).status,
            409,
          );
          assert.equal(
            (await post("organizations/companies/save", owner, payload)).status,
            200,
          );
          assert.equal(
            (await req("auth/session", { session: operator })).data.units
              .length,
            2,
          );
        },
      );
      await t.test(
        "convite transporta escopo exato e não amplia para matriz ou depósito automaticamente",
        async () => {
          const email = "branch-invite@example.invalid";
          assert.equal(
            (
              await post("access/invitations", owner, {
                name: "Operador Filial",
                email,
                roleId: operatorRole.id,
                allUnits: false,
                unitIds: [branch2],
              })
            ).status,
            200,
          );
          const row = (
            await f.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
              [email],
            )
          ).rows[0];
          const message = JSON.parse(decrypt(row.payload_enc, f.key));
          const token = new URLSearchParams(
            new URL(message.url).hash.slice(1),
          ).get("token");
          assert.equal(
            (
              await post("access/invitations/accept", undefined, {
                token,
                password: "Senha fictícia filial 2026!",
              })
            ).status,
            200,
          );
          const s = await req("auth/login", {
            body: { email, password: "Senha fictícia filial 2026!" },
          });
          assert.equal(s.status, 200);
          assert.deepEqual(
            s.data.units.map((u) => u.id),
            [branch2],
          );
          assert.equal(s.data.allUnits, false);
        },
      );
      await t.test(
        "convite pendente não é aceito com unidade que se tornou indisponível",
        async () => {
          const email = "inactive-unit@example.invalid";
          await post("access/invitations", owner, {
            name: "Convite pendente",
            email,
            roleId: operatorRole.id,
            allUnits: false,
            unitIds: [branch1],
          });
          const row = (
            await f.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
              [email],
            )
          ).rows[0];
          const token = new URLSearchParams(
            new URL(JSON.parse(decrypt(row.payload_enc, f.key)).url).hash.slice(
              1,
            ),
          ).get("token");
          const { available, ...payload } = branch1data;
          await post("organizations/units/save", owner, {
            ...payload,
            active: false,
          });
          assert.equal(
            (
              await post("access/invitations/accept", undefined, {
                token,
                password: "Senha fictícia rejeitada!",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await f.admin.query(
                "SELECT id FROM identity.users WHERE email=$1",
                [email],
              )
            ).rowCount,
            0,
          );
          await post("organizations/units/save", owner, payload);
        },
      );
      await t.test(
        "RLS de atribuições, FK composta e disponibilidade não revelam outra rede",
        async () => {
          const c = new pg.Client({ connectionString: f.authUrl });
          await c.connect();
          try {
            assert.equal(
              (await c.query("SELECT * FROM organizations.units")).rowCount,
              0,
            );
            await c.query("BEGIN");
            await c.query("SELECT set_config('app.auth_tenant_id',$1,true)", [
              f.tenantA,
            ]);
            assert.equal(
              (
                await c.query(
                  "SELECT organizations.unit_available($1) AS allowed",
                  [matrixB],
                )
              ).rows[0].allowed,
              false,
            );
            await assert.rejects(
              c.query(
                "INSERT INTO organizations.membership_units(tenant_id,membership_id,unit_id) VALUES($1,$2,$3)",
                [f.tenantA, memberId, matrixB],
              ),
              (e) => e.code === "23503",
            );
            await c.query("ROLLBACK");
          } finally {
            await c.end();
          }
        },
      );
      await t.test(
        "cadastro e auditoria são atômicos quando a gravação do evento falha",
        async () => {
          await f.admin.query(
            "CREATE FUNCTION access.reject_org_event() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'synthetic event failure'; END $function$",
          );
          await f.admin.query(
            "CREATE TRIGGER reject_org_event BEFORE INSERT ON access.events FOR EACH ROW EXECUTE FUNCTION access.reject_org_event()",
          );
          try {
            assert.equal(
              (
                await saveCompany(owner, {
                  cnpj: makeCnpj("77CC00030001"),
                  matrixCode: "ROLLBACK",
                })
              ).status,
              503,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT id FROM organizations.units WHERE code='ROLLBACK'",
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT id FROM organizations.companies WHERE cnpj=$1",
                  [makeCnpj("77CC00030001")],
                )
              ).rowCount,
              0,
            );
          } finally {
            await f.admin.query(
              "DROP TRIGGER reject_org_event ON access.events",
            );
            await f.admin.query("DROP FUNCTION access.reject_org_event()");
          }
        },
      );
      await t.test(
        "pool concorrente mantém unidade e rede isoladas e limpa o contexto",
        async () => {
          const bUser = (
            await f.admin.query(
              "SELECT user_id FROM identity.memberships WHERE tenant_id=$1 AND is_owner LIMIT 1",
              [f.tenantB],
            )
          ).rows[0].user_id;
          await Promise.all(
            Array.from({ length: 16 }, (_, i) => {
              const context =
                i % 2
                  ? { tenantId: f.tenantB, userId: bUser, unitId: matrixB }
                  : {
                      tenantId: f.tenantA,
                      userId: f.users.normal.id,
                      unitId: branch1,
                    };
              return database.withUnit(context, async (c) =>
                assert.deepEqual(
                  (
                    await c.query("SELECT id FROM organizations.units")
                  ).rows.map((u) => u.id),
                  [context.unitId],
                ),
              );
            }),
          );
          await database.withTenant(
            { tenantId: f.tenantA, userId: f.users.normal.id },
            async (c) =>
              assert.equal(
                (await c.query("SELECT id FROM organizations.units")).rowCount,
                0,
              ),
          );
        },
      );
      await t.test(
        "remetente que perde escopo global não mantém convites administrativos pendentes",
        async () => {
          const u = await f.createUser("scope-sender");
          const access = (await req("access/overview", { session: owner }))
            .data;
          const member = access.members.find((m) => m.email === u.email),
            role = access.roles.find((r) => r.name === "Administrador");
          await post("access/members/change", owner, {
            id: member.id,
            roleId: role.id,
            active: true,
          });
          const signed = await login(u, true);
          assert.equal(
            (
              await post("access/invitations", signed, {
                name: "Pendente",
                email: "restricted-sender@example.invalid",
                roleId: operatorRole.id,
                allUnits: false,
                unitIds: [branch1],
              })
            ).status,
            200,
          );
          const row = (
            await f.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
              ["restricted-sender@example.invalid"],
            )
          ).rows[0];
          const token = new URLSearchParams(
            new URL(JSON.parse(decrypt(row.payload_enc, f.key)).url).hash.slice(
              1,
            ),
          ).get("token");
          await post("access/members/change", owner, {
            id: member.id,
            roleId: role.id,
            active: true,
            allUnits: false,
            unitIds: [branch1],
          });
          assert.equal(
            (await post("access/invitations/preview", undefined, { token }))
              .status,
            400,
          );
        },
      );
      await t.test(
        "perfil personalizado administra estrutura sem conceder administração da equipe",
        async () => {
          assert.equal(
            (
              await post("access/roles/save", owner, {
                name: "Estrutura inválida",
                permissions: ["organizations.manage"],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("access/roles/save", owner, {
                name: "Estrutura da rede",
                permissions: ["organizations.read", "organizations.manage"],
              })
            ).status,
            200,
          );
          const u = await f.createUser("structure-manager");
          const access = (await req("access/overview", { session: owner }))
            .data;
          const member = access.members.find((m) => m.email === u.email),
            role = access.roles.find((r) => r.name === "Estrutura da rede");
          await post("access/members/change", owner, {
            id: member.id,
            roleId: role.id,
            active: true,
          });
          assert.equal((await login(u)).data.stage, "mfa_setup");
          const signed = await login(u, true);
          assert.equal((await overview(signed)).data.canManage, true);
          assert.equal(
            (await req("access/overview", { session: signed })).status,
            403,
          );
        },
      );
      await t.test(
        "reiniciar API preserva empresas, unidades, permissões e contexto selecionado",
        async () => {
          await post("auth/unit", operator, { unitId: branch1 });
          await app.close();
          app = await createApplication(
            AppModule.register(f.appUrl, f.config),
            false,
          );
          await app.listen(0, "127.0.0.1");
          url = (await app.getUrl()) + "/api/v1/";
          assert.equal((await overview(owner)).data.companies.length, 2);
          const s = (await req("auth/session", { session: operator })).data;
          assert.equal(s.activeUnitId, branch1);
          assert.deepEqual(
            new Set(s.units.map((u) => u.id)),
            new Set([branch1, depot]),
          );
          const events = Number(
            (
              await f.admin.query(
                "SELECT count(*) AS n FROM access.events WHERE action LIKE 'company.%' OR action LIKE 'unit.%'",
              )
            ).rows[0].n,
          );
          assert.ok(events >= 10);
        },
      );
    } finally {
      await database.close();
      await app.close();
      await f.admin.end();
    }
  },
);

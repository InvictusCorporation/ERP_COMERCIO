import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { migrate } from "../../scripts/database/migrations.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  newMfaSecret,
  encrypt,
  totp,
  hashToken,
  decrypt,
} from "../../apps/api/dist/modules/identity/crypto.js";
test(
  "Auditoria unificada real: integridade, histórico, correlação e escopo",
  { timeout: 120000 },
  async (t) => {
    const f = await authDatabase("http://127.0.0.1:3001", {
      beforeAudit: true,
    });
    let app;
    const secrets = [];
    let url,
      owner,
      normal,
      auditor,
      companyId,
      unitA,
      unitB,
      unitAData,
      roleId,
      auditorMember,
      companyBody,
      creation,
      changed,
      roleChange;
    const legacyId = randomUUID(),
      legacySecurity = randomUUID();
    const legacyTime = "2025-01-02T15:30:00Z";
    const req = async (path, { session, body, headers = {} } = {}) => {
      const response = await fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: f.config.origin }),
          ...(session
            ? { Cookie: session.cookie, "X-CSRF-Token": session.data.csrf }
            : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        requestId: response.headers.get("x-request-id"),
      };
    };
    const post = (path, s, body) => req(path, { session: s, body });
    const list = (s, filters = "") =>
      req("audit/events?" + filters, { session: s });
    async function login(u, mfa = false) {
      secrets.push(u.password);
      if (mfa) {
        const secret = newMfaSecret();
        secrets.push(secret);
        await f.admin.query(
          "UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2",
          [encrypt(secret, f.key), u.id],
        );
        let s = await post("auth/login", undefined, {
          email: u.email,
          password: u.password,
        });
        s = await post("auth/mfa/verify", s, {
          code: totp(secret, u.email).generate(),
        });
        secrets.push(s.cookie.split("=")[1]);
        return s;
      }
      const s = await post("auth/login", undefined, {
        email: u.email,
        password: u.password,
      });
      secrets.push(s.cookie.split("=")[1]);
      return s;
    }
    try {
      await t.test(
        "migração preserva eventos anteriores, datas e limite do conhecimento histórico",
        async () => {
          await f.admin.query(
            "INSERT INTO access.events(id,tenant_id,actor_id,action,target_id,created_at) VALUES($1,$2,$3,$4,$5,$6)",
            [
              legacyId,
              f.tenantA,
              f.users.owner.id,
              "member.changed",
              randomUUID(),
              legacyTime,
            ],
          );
          await f.admin.query(
            "INSERT INTO identity.auth_events(id,user_id,event_type,created_at) VALUES($1,$2,$3,$4)",
            [legacySecurity, f.users.normal.id, "logout", legacyTime],
          );
          assert.equal((await migrate(f.migrationUrl)).length, 2);
          assert.deepEqual(await migrate(f.migrationUrl), []);
          const row = (
            await f.admin.query(
              "SELECT * FROM audit.events WHERE legacy_origin=$1",
              ["access/" + legacyId],
            )
          ).rows[0];
          assert.ok(row.legacy);
          assert.equal(
            row.created_at.toISOString(),
            new Date(legacyTime).toISOString(),
          );
          assert.equal(row.before_data, null);
          assert.equal(row.after_data, null);
          assert.equal(row.request_id, null);
          app = await createApplication(
            AppModule.register(f.appUrl, f.config),
            false,
          );
          await app.listen(0, "127.0.0.1");
          url = (await app.getUrl()) + "/api/v1/";
          owner = await login(f.users.owner, true);
          normal = await login(f.users.normal);
        },
      );
      await t.test(
        "anônimo/operador não leem rede; conta vê somente sua segurança pessoal",
        async () => {
          assert.equal((await list(undefined)).status, 401);
          assert.equal((await list(normal)).status, 403);
          const personal = await list(normal, "scope=personal");
          assert.equal(personal.status, 200);
          assert.ok(
            personal.data.items.some((e) => e.action === "logout" && e.legacy),
          );
          assert.ok(personal.data.items.every((e) => e.tenantId === null));
          const foreign = personal.data.items[0];
          assert.equal(
            (
              await req("audit/events/" + foreign.id + "?scope=personal", {
                session: owner,
              })
            ).status,
            404,
          );
          assert.ok(
            !(await list(owner)).data.items.some(
              (e) => e.category === "security",
            ),
          );
        },
      );
      await t.test(
        "empresa e matriz compartilham correlação gerada no servidor e autor correto",
        async () => {
          companyBody = {
            legalName: "Empresa Fictícia Auditada Ltda.",
            tradeName: "Comércio Auditável 100%",
            cnpj: "12ABC34501DE35",
            matrixCode: "MATRIZ-AUD",
            active: true,
          };
          creation = await req("organizations/companies/save", {
            session: owner,
            body: companyBody,
            headers: { "X-Request-Id": "caller-controlled-value" },
          });
          assert.equal(creation.status, 200);
          assert.match(creation.requestId, /^[a-f0-9-]{36}$/);
          assert.notEqual(creation.requestId, "caller-controlled-value");
          companyId = creation.data.id;
          const page = (await list(owner, "requestId=" + creation.requestId))
            .data;
          assert.equal(page.items.length, 2);
          assert.ok(
            page.items.every(
              (e) =>
                e.actorId === f.users.owner.id &&
                e.requestId === creation.requestId &&
                !e.legacy,
            ),
          );
          const company = page.items.find((e) => e.entityType === "company");
          assert.equal(company.before, null);
          assert.equal(company.after.trade_name, companyBody.tradeName);
          assert.ok(!("transactionId" in company));
        },
      );
      await t.test(
        "alteração detalha antes/depois e salvar valores iguais não cria mudança falsa",
        async () => {
          changed = await post("organizations/companies/save", owner, {
            ...companyBody,
            id: companyId,
            tradeName: "Comércio Renomeado",
            city: "Fortaleza",
          });
          assert.equal(changed.status, 200);
          const event = (await list(owner, "requestId=" + changed.requestId))
            .data.items[0];
          assert.equal(event.before.trade_name, companyBody.tradeName);
          assert.equal(event.after.trade_name, "Comércio Renomeado");
          assert.equal(event.after.city, "Fortaleza");
          assert.equal(event.targetLabel, "Comércio Renomeado");
          const old = (
            await list(owner, "requestId=" + creation.requestId)
          ).data.items.find((e) => e.entityType === "company");
          assert.equal(old.targetLabel, companyBody.tradeName);
          const again = await post("organizations/companies/save", owner, {
            ...companyBody,
            id: companyId,
            tradeName: "Comércio Renomeado",
            city: "Fortaleza",
          });
          assert.equal(
            (await list(owner, "requestId=" + again.requestId)).data.total,
            0,
          );
          companyBody = {
            ...companyBody,
            id: companyId,
            tradeName: "Comércio Renomeado",
            city: "Fortaleza",
          };
        },
      );
      await t.test(
        "perfil, acesso e concessão de unidade registram valores e agrupam a operação",
        async () => {
          const overview = (
            await req("organizations/overview", { session: owner })
          ).data;
          const parent = overview.units.find(
            (u) => u.companyId === companyId && u.kind === "matriz",
          ).id;
          for (const [code, name] of [
            ["AUD-A", "Filial Auditável A"],
            ["AUD-B", "Filial Auditável B"],
          ]) {
            const r = await post("organizations/units/save", owner, {
              companyId,
              parentId: parent,
              kind: "filial",
              code,
              name,
              cnpj: null,
              active: true,
            });
            assert.equal(r.status, 200);
            if (code === "AUD-A") unitA = r.data.id;
            else unitB = r.data.id;
          }
          unitAData = (
            await req("organizations/units/" + unitA, { session: owner })
          ).data;
          const role = await post("access/roles/save", owner, {
            name: "Auditor de filial",
            permissions: ["audit.read", "organizations.read"],
          });
          assert.equal(role.status, 200);
          const roleEvent = (await list(owner, "requestId=" + role.requestId))
            .data.items[0];
          assert.deepEqual(
            new Set(roleEvent.after.permissions),
            new Set(["audit.read", "organizations.read"]),
          );
          roleId = roleEvent.entityId;
          const u = await f.createUser("branch-auditor");
          const access = (await req("access/overview", { session: owner }))
            .data;
          auditorMember = access.members.find((m) => m.email === u.email).id;
          roleChange = await post("access/members/change", owner, {
            id: auditorMember,
            roleId,
            active: true,
            allUnits: false,
            unitIds: [unitA],
          });
          assert.equal(roleChange.status, 200);
          const edits = (await list(owner, "requestId=" + roleChange.requestId))
            .data.items;
          assert.ok(
            edits.some(
              (e) =>
                e.action === "scope.granted" &&
                e.after.unit_name === "Filial Auditável A",
            ),
          );
          assert.ok(
            edits.some(
              (e) =>
                e.action === "member.changed" &&
                e.before.all_units === true &&
                e.after.all_units === false &&
                e.after.role_name === "Auditor de filial",
            ),
          );
          auditor = await login(u, true);
          const unchanged = await post("access/members/change", owner, {
            id: auditorMember,
            roleId,
            active: true,
            allUnits: false,
            unitIds: [unitA],
          });
          assert.equal(unchanged.status, 200);
          assert.equal(
            (await list(owner, "requestId=" + unchanged.requestId)).data.total,
            0,
          );
          const reordered = await post("access/roles/save", owner, {
            id: roleId,
            name: "Auditor de filial",
            permissions: ["organizations.read", "audit.read"],
          });
          assert.equal(reordered.status, 200);
          assert.equal(
            (await list(owner, "requestId=" + reordered.requestId)).data.total,
            0,
          );
        },
      );
      await t.test(
        "auditor restrito recebe apenas eventos de sua filial, inclusive opções e contagens",
        async () => {
          const page = (await list(auditor)).data;
          assert.ok(page.items.length);
          assert.ok(page.items.every((e) => e.unitId === unitA));
          assert.deepEqual(
            page.units.map((u) => u.id),
            [unitA],
          );
          const other = (await list(owner, "unitId=" + unitB)).data.items[0];
          assert.equal(
            (await req("audit/events/" + other.id, { session: auditor }))
              .status,
            404,
          );
          assert.equal((await list(auditor, "unitId=" + unitB)).data.total, 0);
          assert.equal(
            (await list(auditor, "requestId=" + roleChange.requestId)).data
              .total,
            0,
          );
        },
      );
      await t.test(
        "histórico de filial inativa permanece consultável sem liberar operação",
        async () => {
          const { available, ...payload } = unitAData;
          const changed = await post("organizations/units/save", owner, {
            ...payload,
            active: false,
          });
          assert.equal(changed.status, 200);
          const page = (await list(auditor, "requestId=" + changed.requestId))
            .data;
          assert.equal(page.items.length, 1);
          assert.equal(page.items[0].before.active, true);
          assert.equal(page.items[0].after.active, false);
          assert.equal(
            (await post("auth/unit", auditor, { unitId: unitA })).status,
            403,
          );
        },
      );
      await t.test(
        "retirada de escopo afeta histórico e detalhes nas sessões existentes",
        async () => {
          const previous = (await list(auditor)).data.items[0];
          await post("access/members/change", owner, {
            id: auditorMember,
            roleId,
            active: true,
            allUnits: false,
            unitIds: [unitB],
          });
          assert.ok(
            (await list(auditor)).data.items.every((e) => e.unitId === unitB),
          );
          assert.equal(
            (await req("audit/events/" + previous.id, { session: auditor }))
              .status,
            404,
          );
          await post("access/members/change", owner, {
            id: auditorMember,
            roleId,
            active: false,
          });
          assert.equal((await list(auditor)).status, 403);
        },
      );
      await t.test(
        "busca, período, responsável, categoria, detalhe e paginação são limitados ao autorizado",
        async () => {
          const query = await list(
            owner,
            "query=" + encodeURIComponent("100%"),
          );
          assert.equal(query.status, 200);
          assert.ok(
            query.data.items.some(
              (e) => e.targetLabel === "Comércio Auditável 100%",
            ),
          );
          assert.equal(
            (await list(owner, "query=" + encodeURIComponent("' OR true --")))
              .data.total,
            0,
          );
          assert.equal(
            (await list(owner, "from=2025-01-02&to=2025-01-02")).data.total,
            1,
          );
          assert.equal((await list(owner, "category=security")).data.total, 0);
          const p0 = (await list(owner, "pageSize=2&page=0")).data,
            p1 = (await list(owner, "pageSize=2&page=1")).data;
          assert.equal(p0.items.length, 2);
          assert.equal(p1.items.length, 2);
          assert.ok(!p0.items.some((e) => p1.items.some((x) => x.id === e.id)));
          assert.equal(p0.total, p1.total);
          const detail = await req("audit/events/" + p0.items[0].id, {
            session: owner,
          });
          assert.equal(detail.status, 200);
          assert.equal(detail.data.id, p0.items[0].id);
          const actor = (await list(owner, "actor=" + f.users.owner.id)).data;
          assert.ok(actor.items.every((e) => e.actorId === f.users.owner.id));
        },
      );
      await t.test(
        "filtros adulterados, datas impossíveis e limites de paginação são recusados",
        async () => {
          for (const query of [
            "scope=other",
            "category=other",
            "actor=other",
            "unitId=other",
            "from=2026-02-30",
            "from=2026-12-01&to=2026-01-01",
            "page=-1",
            "pageSize=0",
            "pageSize=100",
            "page=1001",
            "tenantId=" + f.tenantB,
            "scope=personal&scope=network",
          ])
            assert.equal((await list(owner, query)).status, 400, query);
        },
      );
      await t.test(
        "eventos de outra rede e segurança de outro usuário não entram na consulta",
        async () => {
          const foreign = (
            await f.admin.query(
              "INSERT INTO audit.events(tenant_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action) VALUES($1,$2,'Outro ator','Outra rede','organizations','company',$3,'company.changed') RETURNING id",
              [f.tenantB, f.users.other.id, randomUUID()],
            )
          ).rows[0];
          assert.equal(
            (await req("audit/events/" + foreign.id, { session: owner }))
              .status,
            404,
          );
          assert.equal(
            (await list(owner, "entityId=" + foreign.id)).data.total,
            0,
          );
          assert.ok(
            !(await list(owner)).data.items.some(
              (e) => e.tenantId === f.tenantB,
            ),
          );
        },
      );
      await t.test(
        "autenticação é unificada sem copiar senhas, hashes, tokens, chave, MFA ou mensagem cifrada",
        async () => {
          await post("auth/login", undefined, {
            email: f.users.normal.email,
            password: "Synthetic wrong password 2026!",
          });
          await post("auth/forgot-password", undefined, {
            email: f.users.normal.email,
          });
          await post("auth/unit", normal, { unitId: unitB });
          const personal = (await list(normal, "scope=personal")).data;
          assert.ok(personal.items.some((e) => e.action === "login_failed"));
          assert.ok(
            personal.items.some((e) => e.action === "password_reset_requested"),
          );
          assert.ok(personal.items.some((e) => e.action === "context.changed"));
          const messageRow = (
            await f.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
              [f.users.normal.email],
            )
          ).rows[0];
          const recoveryToken = new URLSearchParams(
            new URL(
              JSON.parse(decrypt(messageRow.payload_enc, f.key)).url,
            ).hash.slice(1),
          ).get("token");
          const newPassword = "Senha fictícia da auditoria 2026!";
          secrets.push(recoveryToken, newPassword);
          assert.equal(
            (
              await post("auth/reset-password", undefined, {
                token: recoveryToken,
                password: newPassword,
              })
            ).status,
            200,
          );
          normal = await login({ ...f.users.normal, password: newPassword });
          assert.ok(
            (await list(normal, "scope=personal")).data.items.some(
              (e) => e.action === "password_reset_completed",
            ),
          );
          secrets.push(f.key);
          for (const r of (
            await f.admin.query(
              "SELECT password_hash,mfa_secret_enc FROM identity.credentials",
            )
          ).rows) {
            secrets.push(r.password_hash);
            if (r.mfa_secret_enc) secrets.push(r.mfa_secret_enc);
          }
          for (const r of (
            await f.admin.query("SELECT token_hash FROM identity.sessions")
          ).rows)
            secrets.push(r.token_hash);
          for (const r of (
            await f.admin.query("SELECT payload_enc FROM identity.mail_outbox")
          ).rows)
            secrets.push(r.payload_enc);
          const serialized = JSON.stringify(
            (await f.admin.query("SELECT * FROM audit.events")).rows,
          );
          for (const secret of secrets)
            assert.equal(
              serialized.includes(secret),
              false,
              "Segredo presente no histórico",
            );
          for (const key of [
            "password_hash",
            "mfa_secret_enc",
            "token_hash",
            "payload_enc",
          ])
            assert.equal(serialized.includes('"' + key + '"'), false);
        },
      );
      await t.test(
        "identidade congelada do responsável não é reescrita por alteração posterior do nome",
        async () => {
          const before = (await list(owner, "requestId=" + creation.requestId))
            .data.items[0];
          await f.admin.query(
            "UPDATE identity.users SET display_name='Nome posterior de teste' WHERE id=$1",
            [f.users.owner.id],
          );
          const after = (
            await req("audit/events/" + before.id, { session: owner })
          ).data;
          assert.equal(after.actorName, before.actorName);
          assert.notEqual(after.actorName, "Nome posterior de teste");
        },
      );
      await t.test(
        "papéis HTTP não inserem, alteram, apagam ou truncam auditoria nem executam funções de captura",
        async () => {
          for (const connectionString of [f.authUrl, f.appUrl]) {
            const c = new pg.Client({ connectionString });
            await c.connect();
            try {
              for (const sql of [
                "INSERT INTO audit.events(actor_name,target_label,category,entity_type,action) VALUES('a','b','security','account','login_failed')",
                "UPDATE audit.events SET actor_name='forjado'",
                "DELETE FROM audit.events",
                "TRUNCATE audit.events",
                "SELECT audit.safe_snapshot('role','{}'::jsonb)",
              ])
                await assert.rejects(c.query(sql), (e) => e.code === "42501");
              if (connectionString === f.authUrl)
                assert.equal(
                  (await c.query("SELECT * FROM audit.events")).rowCount,
                  0,
                );
              else
                await assert.rejects(
                  c.query("SELECT * FROM audit.events"),
                  (e) => e.code === "42501",
                );
            } finally {
              await c.end();
            }
          }
        },
      );
      await t.test(
        "falha na auditoria reverte empresa, matriz e alteração de acesso na mesma transação",
        async () => {
          const resetUser = await f.createUser("audit-reset-target");
          const resetSession = await login(resetUser);
          await post("auth/forgot-password", undefined, {
            email: resetUser.email,
          });
          const messageRow = (
            await f.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
              [resetUser.email],
            )
          ).rows[0];
          const resetToken = new URLSearchParams(
            new URL(
              JSON.parse(decrypt(messageRow.payload_enc, f.key)).url,
            ).hash.slice(1),
          ).get("token");
          const originalHash = (
            await f.admin.query(
              "SELECT password_hash FROM identity.credentials WHERE user_id=$1",
              [resetUser.id],
            )
          ).rows[0].password_hash;
          await f.admin.query(
            "CREATE FUNCTION audit.reject_test() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $function$",
          );
          await f.admin.query(
            "CREATE TRIGGER reject_test BEFORE INSERT ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.reject_test()",
          );
          try {
            assert.equal(
              (
                await post("auth/reset-password", undefined, {
                  token: resetToken,
                  password: "Tentativa fictícia sem auditoria!",
                })
              ).status,
              503,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT password_hash FROM identity.credentials WHERE user_id=$1",
                  [resetUser.id],
                )
              ).rows[0].password_hash === originalHash,
              true,
            );
            assert.equal(
              (await req("auth/session", { session: resetSession })).status,
              200,
            );
            assert.equal(
              (
                await post("organizations/companies/save", owner, {
                  ...companyBody,
                  id: undefined,
                  cnpj: "11222333000181",
                  matrixCode: "AUD-ROLLBACK",
                  tradeName: "Não deve persistir",
                })
              ).status,
              503,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT id FROM organizations.units WHERE code='AUD-ROLLBACK'",
                )
              ).rowCount,
              0,
            );
            const before = (
              await f.admin.query(
                "SELECT active FROM identity.memberships WHERE id=$1",
                [auditorMember],
              )
            ).rows[0].active;
            assert.equal(
              (
                await post("access/members/change", owner, {
                  id: auditorMember,
                  roleId,
                  active: !before,
                })
              ).status,
              503,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT active FROM identity.memberships WHERE id=$1",
                  [auditorMember],
                )
              ).rows[0].active,
              before,
            );
          } finally {
            await f.admin.query("DROP TRIGGER reject_test ON audit.events");
            await f.admin.query("DROP FUNCTION audit.reject_test()");
          }
        },
      );
      await t.test(
        "correlação e ator não vazam entre operações simultâneas de contas diferentes",
        async () => {
          const user = await f.createUser("parallel-owner", {
            mfaRequired: true,
          });
          const signed = await login(user, true);
          const results = await Promise.all([
            post("access/roles/save", owner, {
              name: "Perfil paralelo A",
              permissions: [],
            }),
            post("access/roles/save", signed, {
              name: "Perfil paralelo B",
              permissions: [],
            }),
          ]);
          assert.ok(results.every((r) => r.status === 200));
          assert.notEqual(results[0].requestId, results[1].requestId);
          for (let i = 0; i < 2; i++) {
            const items = (
              await list(owner, "requestId=" + results[i].requestId)
            ).data.items;
            assert.equal(items.length, 1);
            assert.equal(items[0].actorId, i ? user.id : f.users.owner.id);
          }
        },
      );
      await t.test(
        "consulta e atualização de sessão sem mudança não produzem auditoria infinita; histórico resiste ao reinício",
        async () => {
          const before = Number(
            (await f.admin.query("SELECT count(*) AS n FROM audit.events"))
              .rows[0].n,
          );
          await list(owner);
          await req("auth/session", { session: owner });
          await req("auth/session", { session: owner });
          assert.equal(
            Number(
              (await f.admin.query("SELECT count(*) AS n FROM audit.events"))
                .rows[0].n,
            ),
            before,
          );
          await app.close();
          app = await createApplication(
            AppModule.register(f.appUrl, f.config),
            false,
          );
          await app.listen(0, "127.0.0.1");
          url = (await app.getUrl()) + "/api/v1/";
          assert.equal(
            (await list(owner, "requestId=" + creation.requestId)).data.items
              .length,
            2,
          );
        },
      );
    } finally {
      if (app) await app.close();
      await f.admin.end();
    }
  },
);

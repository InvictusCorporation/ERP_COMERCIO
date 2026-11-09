import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  decrypt,
  newMfaSecret,
  totp,
  encrypt,
  hashToken,
} from "../../apps/api/dist/modules/identity/crypto.js";
test(
  "Controle de acesso real: empresas, usuários, perfis e convites",
  { timeout: 120000 },
  async (t) => {
    const f = await authDatabase();
    const app = await createApplication(
      AppModule.register(f.appUrl, f.config),
      false,
    );
    await app.listen(0, "127.0.0.1");
    const url = (await app.getUrl()) + "/api/v1/";
    async function req(
      path,
      { session, body, origin = f.config.origin, csrf = true } = {},
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
    async function login(user, { owner = false } = {}) {
      if (owner) {
        const secret = newMfaSecret();
        await f.admin.query(
          "UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=now() WHERE user_id=$2",
          [encrypt(secret, f.key), user.id],
        );
        let s = await req("auth/login", {
          body: { email: user.email, password: user.password },
        });
        s = await req("auth/mfa/verify", {
          session: s,
          body: { code: totp(secret, user.email).generate() },
        });
        return s;
      }
      return req("auth/login", {
        body: { email: user.email, password: user.password },
      });
    }
    const post = (path, session, body) =>
      req("access/" + path, { session, body });
    async function mail(email) {
      const row = (
        await f.admin.query(
          "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
          [email],
        )
      ).rows[0];
      assert.ok(row);
      return JSON.parse(decrypt(row.payload_enc, f.key));
    }
    const token = (m) =>
      new URLSearchParams(new URL(m.url).hash.slice(1)).get("token");
    let owner, operator, overview, operatorRole, adminRole, ownerRole, custom;
    try {
      await t.test(
        "anônimo e operador não consultam administração nem por URL direta",
        async () => {
          owner = await login(f.users.owner, { owner: true });
          operator = await login(f.users.normal);
          assert.equal(owner.status, 200);
          assert.equal((await req("access/overview")).status, 401);
          assert.equal(
            (await req("access/overview", { session: operator })).status,
            403,
          );
          overview = (await req("access/overview", { session: owner })).data;
          assert.equal(overview.tenant.id, f.tenantA);
          assert.ok(
            overview.members.every((m) => m.email !== f.users.other.email),
          );
          operatorRole = overview.roles.find(
            (r) => r.name === "Operador de caixa",
          );
          adminRole = overview.roles.find((r) => r.name === "Administrador");
          ownerRole = overview.roles.find((r) => r.name === "Proprietário");
        },
      );
      await t.test(
        "mutação exige Origin, CSRF e campos estritos; cliente não cria Master",
        async () => {
          const input = { name: "Perfil teste", permissions: ["users.read"] };
          assert.equal(
            (
              await req("access/roles/save", {
                session: owner,
                body: input,
                csrf: false,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await req("access/roles/save", {
                session: owner,
                body: input,
                origin: "https://invalid.example",
              })
            ).status,
            403,
          );
          assert.equal(
            (await post("roles/save", owner, { ...input, tenantId: f.tenantB }))
              .status,
            400,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "Master",
                permissions: [],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "Qualquer",
                permissions: ["platform.master"],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "Qualquer",
                permissions: ["ownership.manage"],
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        "proprietário cria perfil configurável; perfis padrão são protegidos",
        async () => {
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "Consulta de equipe",
                permissions: ["users.read"],
              })
            ).status,
            200,
          );
          overview = (await req("access/overview", { session: owner })).data;
          custom = overview.roles.find((r) => r.name === "Consulta de equipe");
          assert.equal(
            (
              await post("roles/save", owner, {
                id: adminRole.id,
                name: "Admin alterado",
                permissions: [],
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "Admin inválido",
                permissions: ["users.manage"],
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                name: "consulta de equipe",
                permissions: [],
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "permissão é aplicada imediatamente a sessão existente e retirada sem novo login",
        async () => {
          const m = overview.members.find(
            (m) => m.email === f.users.normal.email,
          );
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: custom.id,
                active: true,
              })
            ).status,
            200,
          );
          assert.equal(
            (await req("access/overview", { session: operator })).status,
            200,
          );
          assert.equal(
            (
              await post("invitations", operator, {
                name: "Bloqueado",
                email: "blocked@example.invalid",
                roleId: operatorRole.id,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                id: custom.id,
                name: "Consulta de equipe",
                permissions: [],
              })
            ).status,
            200,
          );
          assert.equal(
            (await req("access/overview", { session: operator })).status,
            403,
          );
        },
      );
      await t.test(
        "último proprietário ativo não pode ser suspenso ou rebaixado",
        async () => {
          const m = overview.members.find(
            (m) => m.email === f.users.owner.email,
          );
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: operatorRole.id,
                active: true,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: ownerRole.id,
                active: false,
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "IDs de outra empresa e papéis cruzados falham sem revelar recursos",
        async () => {
          const foreign = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantB, f.users.other.id],
            )
          ).rows[0];
          assert.equal(
            (
              await post("members/change", owner, {
                id: foreign.id,
                roleId: operatorRole.id,
                active: false,
              })
            ).status,
            404,
          );
          const roleId = randomUUID();
          await f.admin.query(
            "INSERT INTO access.roles(tenant_id,id,name) VALUES($1,$2,$3)",
            [f.tenantB, roleId, "Perfil B"],
          );
          assert.equal(
            (
              await post("invitations", owner, {
                name: "Cruzar",
                email: "cross@example.invalid",
                roleId,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await post("roles/save", owner, {
                id: roleId,
                name: "Alterar",
                permissions: [],
              })
            ).status,
            404,
          );
        },
      );
      await t.test(
        "convite não expõe token na resposta; outbox cifrada e vínculo apenas após aceite",
        async () => {
          const r = await post("invitations", owner, {
            name: "Nova Pessoa",
            email: "invite-new@example.invalid",
            roleId: operatorRole.id,
          });
          assert.equal(r.status, 200);
          assert.deepEqual(r.data, { ok: true });
          const msg = await mail("invite-new@example.invalid");
          assert.equal(msg.kind, "invitation");
          assert.equal(
            (
              await f.admin.query(
                "SELECT id FROM identity.users WHERE email=$1",
                ["invite-new@example.invalid"],
              )
            ).rowCount,
            0,
          );
          const preview = await req("access/invitations/preview", {
            body: { token: token(msg) },
          });
          assert.equal(preview.status, 200);
          assert.equal(preview.data.company, "Comércio de Teste A");
          assert.equal(preview.data.existingAccount, false);
          const accepted = await req("access/invitations/accept", {
            body: { token: token(msg), password: "Senha fictícia nova 2026!" },
          });
          assert.equal(accepted.status, 200);
          assert.equal(
            (
              await req("access/invitations/accept", {
                body: {
                  token: token(msg),
                  password: "Senha fictícia nova 2026!",
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req("auth/login", {
                body: { email: msg.to, password: "Senha fictícia nova 2026!" },
              })
            ).status,
            200,
          );
          const i = (
            await f.admin.query(
              "SELECT token_hash FROM access.invitations WHERE email=$1",
              [msg.to],
            )
          ).rows[0];
          assert.equal(i.token_hash, hashToken(token(msg)));
        },
      );
      await t.test(
        "convites revogados, expirados e adulterados são recusados",
        async () => {
          for (const mode of ["revoked", "expired"]) {
            const email = mode + "@example.invalid";
            await post("invitations", owner, {
              name: mode,
              email,
              roleId: operatorRole.id,
            });
            const msg = await mail(email);
            const i = (
              await f.admin.query(
                "SELECT id FROM access.invitations WHERE email=$1",
                [email],
              )
            ).rows[0];
            if (mode === "revoked")
              assert.equal(
                (await post("invitations/revoke", owner, { id: i.id })).status,
                200,
              );
            else
              await f.admin.query(
                "UPDATE access.invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
                [i.id],
              );
            assert.equal(
              (
                await req("access/invitations/preview", {
                  body: { token: token(msg) },
                })
              ).status,
              400,
            );
          }
          assert.equal(
            (
              await req("access/invitations/preview", {
                body: { token: "f".repeat(64) },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "conta existente exige sessão da pessoa convidada, sem trocar senha ou nome global",
        async () => {
          const user = await f.createUser("existing", { tenant: f.tenantB });
          const s = await login(user);
          await post("invitations", owner, {
            name: "Nome não aplicado",
            email: user.email,
            roleId: operatorRole.id,
          });
          const msg = await mail(user.email);
          assert.equal(
            (
              await req("access/invitations/accept", {
                body: {
                  token: token(msg),
                  password: "Não deve substituir 2026!",
                },
              })
            ).status,
            403,
          );
          assert.equal(
            (await post("invitations/accept", owner, { token: token(msg) }))
              .status,
            403,
          );
          assert.equal(
            (await post("invitations/accept", s, { token: token(msg) })).status,
            200,
          );
          assert.equal(
            (
              await f.admin.query(
                "SELECT display_name FROM identity.users WHERE id=$1",
                [user.id],
              )
            ).rows[0].display_name,
            "Usuário de teste existing",
          );
          assert.equal((await login(user)).status, 200);
        },
      );
      await t.test(
        "aceites concorrentes criam somente uma conta e um vínculo",
        async () => {
          await post("invitations", owner, {
            name: "Concorrente",
            email: "concurrent@example.invalid",
            roleId: operatorRole.id,
          });
          const msg = await mail("concurrent@example.invalid");
          const requests = await Promise.all(
            [1, 2].map(() =>
              req("access/invitations/accept", {
                body: {
                  token: token(msg),
                  password: "Senha fictícia concorrente!",
                },
              }),
            ),
          );
          assert.deepEqual(requests.map((r) => r.status).sort(), [200, 400]);
          assert.equal(
            Number(
              (
                await f.admin.query(
                  "SELECT count(*) AS n FROM identity.users WHERE email='concurrent@example.invalid'",
                )
              ).rows[0].n,
            ),
            1,
          );
        },
      );
      await t.test(
        "perfis sensíveis exigem MFA e não permitem escalada de administrador para proprietário",
        async () => {
          const admin = await f.createUser("tenant-admin", {
            secret: newMfaSecret(),
          });
          await f.admin.query(
            "UPDATE identity.memberships SET role_id=$1 WHERE tenant_id=$2 AND user_id=$3",
            [adminRole.id, f.tenantA, admin.id],
          );
          const s = await login(admin, { owner: true });
          assert.equal(
            (await req("access/overview", { session: s })).status,
            200,
          );
          assert.equal(
            (
              await post("invitations", s, {
                name: "Escalada",
                email: "escalate@example.invalid",
                roleId: ownerRole.id,
              })
            ).status,
            403,
          );
          const own = overview.members.find((m) => m.isOwner);
          assert.equal(
            (
              await post("members/change", s, {
                id: own.id,
                roleId: operatorRole.id,
                active: false,
              })
            ).status,
            403,
          );
          const normal = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE user_id=$1 AND tenant_id=$2",
              [f.users.normal.id, f.tenantA],
            )
          ).rows[0];
          assert.equal(
            (
              await post("members/change", owner, {
                id: normal.id,
                roleId: adminRole.id,
                active: true,
              })
            ).status,
            200,
          );
          assert.equal(
            (await req("access/overview", { session: operator })).status,
            403,
          );
          const partial = await req("auth/session", { session: operator });
          assert.equal(partial.data.stage, "mfa_setup");
        },
      );
      await t.test(
        "suspensão afeta somente a empresa; permissões não se somam entre vínculos",
        async () => {
          const u = await f.createUser("two-tenants", { shared: true });
          const s = await login(u);
          await f.admin.query(
            "UPDATE identity.memberships SET role_id=$1 WHERE tenant_id=$2 AND user_id=$3",
            [custom.id, f.tenantA, u.id],
          );
          await post("roles/save", owner, {
            id: custom.id,
            name: "Consulta de equipe",
            permissions: ["users.read"],
          });
          await req("auth/context", {
            session: s,
            body: { tenantId: f.tenantA },
          });
          assert.equal(
            (await req("access/overview", { session: s })).status,
            200,
          );
          await req("auth/context", {
            session: s,
            body: { tenantId: f.tenantB },
          });
          assert.equal(
            (await req("access/overview", { session: s })).status,
            403,
          );
          await req("auth/context", {
            session: s,
            body: { tenantId: f.tenantA },
          });
          const m = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantA, u.id],
            )
          ).rows[0];
          await post("members/change", owner, {
            id: m.id,
            roleId: custom.id,
            active: false,
          });
          assert.equal(
            (await req("access/overview", { session: s })).status,
            403,
          );
          const current = await req("auth/session", { session: s });
          assert.equal(current.status, 200);
          assert.deepEqual(
            current.data.tenants.map((t) => t.id),
            [f.tenantB],
          );
        },
      );
      await t.test(
        "revogar a autoridade do remetente invalida convites ainda pendentes",
        async () => {
          const u = await f.createUser("sender");
          await f.admin.query(
            "UPDATE identity.memberships SET role_id=$1 WHERE tenant_id=$2 AND user_id=$3",
            [adminRole.id, f.tenantA, u.id],
          );
          const s = await login(u, { owner: true });
          assert.equal(
            (
              await post("invitations", s, {
                name: "Pendente",
                email: "sender-revoked@example.invalid",
                roleId: operatorRole.id,
              })
            ).status,
            200,
          );
          const msg = await mail("sender-revoked@example.invalid");
          await f.admin.query(
            "UPDATE identity.memberships SET active=false WHERE tenant_id=$1 AND user_id=$2",
            [f.tenantA, u.id],
          );
          assert.equal(
            (
              await req("access/invitations/accept", {
                body: {
                  token: token(msg),
                  password: "Senha fictícia bloqueada!",
                },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "RLS nega escopo ausente/cruzado, FK composta e eventos são imutáveis",
        async () => {
          const c = new pg.Client({ connectionString: f.authUrl });
          await c.connect();
          try {
            assert.equal(
              (await c.query("SELECT * FROM access.roles")).rowCount,
              0,
            );
            await c.query("BEGIN");
            await c.query("SELECT set_config('app.auth_tenant_id',$1,true)", [
              f.tenantA,
            ]);
            assert.equal(
              (
                await c.query(
                  "SELECT id FROM access.roles WHERE tenant_id=$1",
                  [f.tenantB],
                )
              ).rowCount,
              0,
            );
            await assert.rejects(
              c.query(
                "INSERT INTO access.roles(tenant_id,name) VALUES($1,$2)",
                [f.tenantB, "negado"],
              ),
              (e) => e.code === "42501",
            );
            await c.query("ROLLBACK");
            for (const query of [
              "UPDATE access.events SET action='role.changed'",
              "DELETE FROM access.events",
            ])
              await assert.rejects(c.query(query), (e) => e.code === "42501");
          } finally {
            await c.end();
          }
          const n = Number(
            (
              await f.admin.query(
                "SELECT count(*) AS n FROM access.events WHERE tenant_id=$1",
                [f.tenantA],
              )
            ).rows[0].n,
          );
          assert.ok(n > 10);
        },
      );

      await t.test(
        "reenvio substitui convite anterior e aceite de administrador inicia com MFA",
        async () => {
          const email = "reissued@example.invalid";
          await post("invitations", owner, {
            name: "Reenviado",
            email,
            roleId: operatorRole.id,
          });
          const old = await mail(email);
          await post("invitations", owner, {
            name: "Reenviado",
            email,
            roleId: adminRole.id,
          });
          const newer = await mail(email);
          assert.notEqual(token(old), token(newer));
          assert.equal(
            (
              await req("access/invitations/preview", {
                body: { token: token(old) },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req("access/invitations/accept", {
                body: {
                  token: token(newer),
                  password: "Senha fictícia MFA nova!",
                },
              })
            ).status,
            200,
          );
          const partial = await req("auth/login", {
            body: { email, password: "Senha fictícia MFA nova!" },
          });
          assert.equal(partial.status, 200);
          assert.equal(partial.data.stage, "mfa_setup");
          assert.deepEqual(partial.data.permissions, []);
          assert.equal(
            (await req("access/overview", { session: partial })).status,
            403,
          );
        },
      );
      await t.test(
        "falha ao gravar evento desfaz a alteração do perfil",
        async () => {
          await f.admin.query(
            "CREATE FUNCTION access.test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $function$",
          );
          await f.admin.query(
            "CREATE TRIGGER test_reject_event BEFORE INSERT ON access.events FOR EACH ROW EXECUTE FUNCTION access.test_reject_event()",
          );
          try {
            assert.equal(
              (
                await post("roles/save", owner, {
                  name: "Deve reverter",
                  permissions: [],
                })
              ).status,
              503,
            );
            assert.equal(
              (
                await f.admin.query(
                  "SELECT id FROM access.roles WHERE tenant_id=$1 AND name='Deve reverter'",
                  [f.tenantA],
                )
              ).rowCount,
              0,
            );
          } finally {
            await f.admin.query(
              "DROP TRIGGER test_reject_event ON access.events",
            );
            await f.admin.query("DROP FUNCTION access.test_reject_event()");
          }
        },
      );
      await t.test(
        "reativação restaura vínculo sem recriar conta; identidade global inativa não é reativável",
        async () => {
          const u = await f.createUser("reactivate");
          const session = await login(u);
          const m = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantA, u.id],
            )
          ).rows[0];
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: custom.id,
                active: true,
              })
            ).status,
            200,
          );
          assert.equal((await req("access/overview", { session })).status, 200);
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: custom.id,
                active: false,
              })
            ).status,
            200,
          );
          assert.equal((await req("access/overview", { session })).status, 403);
          assert.equal(
            (
              await post("members/change", owner, {
                id: m.id,
                roleId: custom.id,
                active: true,
              })
            ).status,
            200,
          );
          assert.equal((await req("access/overview", { session })).status, 200);
          const inactive = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
              [f.tenantA, f.users.inactive.id],
            )
          ).rows[0];
          assert.equal(
            (
              await post("members/change", owner, {
                id: inactive.id,
                roleId: operatorRole.id,
                active: true,
              })
            ).status,
            409,
          );
          const latest = (await req("access/overview", { session: owner }))
            .data;
          assert.equal(
            latest.members.find((m) => m.email === f.users.inactive.email)
              .active,
            false,
          );
        },
      );
      await t.test(
        "FK composta impede atribuir perfil de outra empresa mesmo com escrita SQL privilegiada",
        async () => {
          const foreign = (
            await f.admin.query(
              "SELECT id FROM access.roles WHERE tenant_id=$1 LIMIT 1",
              [f.tenantB],
            )
          ).rows[0];
          assert.ok(foreign);
          await assert.rejects(
            f.admin.query(
              "UPDATE identity.memberships SET role_id=$1 WHERE tenant_id=$2 AND user_id=$3",
              [foreign.id, f.tenantA, f.users.normal.id],
            ),
            (e) => e.code === "23503",
          );
        },
      );
      await t.test(
        "duas suspensões concorrentes preservam um proprietário ativo",
        async () => {
          const second = await f.createUser("second-owner", {
            mfaRequired: true,
          });
          const s = await login(second, { owner: true });
          const own = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE user_id=$1 AND tenant_id=$2",
              [f.users.owner.id, f.tenantA],
            )
          ).rows[0];
          const another = (
            await f.admin.query(
              "SELECT id FROM identity.memberships WHERE user_id=$1 AND tenant_id=$2",
              [second.id, f.tenantA],
            )
          ).rows[0];
          const responses = await Promise.all([
            post("members/change", owner, {
              id: own.id,
              roleId: ownerRole.id,
              active: false,
            }),
            post("members/change", s, {
              id: another.id,
              roleId: ownerRole.id,
              active: false,
            }),
          ]);
          assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
          assert.equal(
            Number(
              (
                await f.admin.query(
                  "SELECT count(*) AS n FROM identity.memberships WHERE tenant_id=$1 AND is_owner AND active",
                  [f.tenantA],
                )
              ).rows[0].n,
            ),
            1,
          );
        },
      );
    } finally {
      await app.close();
      await f.admin.end();
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { authDatabase } from "../support/auth-database.mjs";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";
import {
  totp,
  hashToken,
  decrypt,
  newMfaSecret,
  hashPassword,
} from "../../apps/api/dist/modules/identity/crypto.js";

test(
  "Autenticação real: login, sessões, MFA e recuperação",
  { timeout: 120000 },
  async (t) => {
    const fixture = await authDatabase();
    const mail = [];
    const app = await createApplication(
      AppModule.register(fixture.appUrl, fixture.config, async (message) => {
        mail.push(message);
      }),
      false,
    );
    await app.listen(0, "127.0.0.1");
    const url = (await app.getUrl()) + "/api/v1/auth/";
    async function request(
      path,
      { body, cookie, csrf, origin = fixture.config.origin, headers = {} } = {},
    ) {
      const response = await fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", Origin: origin }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        setCookie: response.headers.get("set-cookie"),
      };
    }
    const login = (user, extra = {}) =>
      request("login", {
        body: { email: user.email, password: user.password },
        ...extra,
      });
    const post = (path, session, body = {}) =>
      request(path, { body, cookie: session.cookie, csrf: session.data.csrf });
    async function message(email) {
      for (let i = 0; i < 100; i++) {
        const found = mail.filter((item) => item.to === email).at(-1);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Mensagem de teste ausente");
    }
    const tokenFrom = (message) =>
      new URLSearchParams(new URL(message.url).hash.slice(1)).get("token");
    try {
      await t.test(
        "anônimo não consulta sessão, sessões ativas ou contexto",
        async () => {
          assert.equal((await request("session")).status, 401);
          assert.equal((await request("sessions")).status, 401);
          assert.equal(
            (await request("context", { body: { tenantId: fixture.tenantA } }))
              .status,
            401,
          );
        },
      );
      await t.test(
        "JSON inválido ou excessivo falha sem refletir conteúdo sensível",
        async () => {
          const invalid = await fetch(url + "login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: fixture.config.origin,
            },
            body: '{"password":"Synthetic-private-test",invalid',
          });
          assert.equal(invalid.status, 400);
          assert.ok(!(await invalid.text()).includes("Synthetic-private-test"));
          const large = await fetch(url + "login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: fixture.config.origin,
            },
            body: JSON.stringify({ data: "x".repeat(18000) }),
          });
          assert.equal(large.status, 413);
        },
      );
      await t.test(
        "credenciais incorretas, conta ausente e inativa têm a mesma resposta",
        async () => {
          const wrong = await login({
            ...fixture.users.normal,
            password: "Uma senha incorreta de teste",
          });
          const unknown = await login({
            email: "missing@example.invalid",
            password: "Uma senha incorreta de teste",
          });
          const inactive = await login(fixture.users.inactive);
          assert.equal(wrong.status, 401);
          assert.deepEqual(wrong.data, unknown.data);
          assert.deepEqual(wrong.data, inactive.data);
          assert.equal(wrong.cookie, undefined);
        },
      );
      await t.test(
        "login normal cria cookie HttpOnly e banco não contém senha/token em claro",
        async () => {
          const session = await login(fixture.users.normal);
          assert.equal(session.status, 200);
          assert.equal(session.data.stage, "authenticated");
          assert.match(session.setCookie, /HttpOnly/);
          assert.match(session.setCookie, /SameSite=Lax/);
          assert.match(session.setCookie, /Path=\//);
          const raw = session.cookie.split("=")[1];
          assert.ok(!JSON.stringify(session.data).includes(raw));
          const stored = (
            await fixture.admin.query(
              "SELECT token_hash FROM identity.sessions WHERE id=$1",
              [session.data.id],
            )
          ).rows[0];
          assert.equal(stored.token_hash, hashToken(raw));
          assert.notEqual(stored.token_hash, raw);
          const credential = (
            await fixture.admin.query(
              "SELECT password_hash FROM identity.credentials WHERE user_id=$1",
              [fixture.users.normal.id],
            )
          ).rows[0];
          assert.match(credential.password_hash, /^\$argon2id\$/);
          assert.ok(
            !credential.password_hash.includes(fixture.users.normal.password),
          );
          assert.equal(session.data.tenants.length, 1);
          assert.equal(session.data.tenants[0].id, fixture.tenantA);
        },
      );
      await t.test(
        "login substitui cookie existente e rejeita fixação de sessão",
        async () => {
          const user = await fixture.createUser("rotation");
          const first = await login(user);
          const second = await login(user, { cookie: first.cookie });
          assert.notEqual(first.cookie, second.cookie);
          assert.equal(
            (await request("session", { cookie: first.cookie })).status,
            401,
          );
          assert.equal(
            (await request("session", { cookie: second.cookie })).status,
            200,
          );
        },
      );
      await t.test(
        "senha Unicode usa o mesmo limite de caracteres do bootstrap e da API",
        async () => {
          const user = await fixture.createUser("unicode");
          const password = "🔐".repeat(128);
          await fixture.admin.query(
            "UPDATE identity.credentials SET password_hash=$1 WHERE user_id=$2",
            [await hashPassword(password), user.id],
          );
          assert.equal((await login({ ...user, password })).status, 200);
        },
      );
      await t.test(
        "CSRF, origem e campos de identidade adulterados são recusados",
        async () => {
          const session = await login(await fixture.createUser("csrf"));
          assert.equal(
            (await request("logout", { body: {}, cookie: session.cookie }))
              .status,
            403,
          );
          assert.equal(
            (
              await request("logout", {
                body: {},
                cookie: session.cookie,
                csrf: "0".repeat(64),
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request("logout", {
                body: {},
                cookie: session.cookie,
                csrf: session.data.csrf,
                origin: "https://foreign.invalid",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request("login", {
                body: {
                  email: fixture.users.normal.email,
                  password: fixture.users.normal.password,
                  userId: fixture.users.other.id,
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (await request("session", { cookie: session.cookie })).status,
            200,
          );
        },
      );
      await t.test(
        "vínculo e contexto são derivados da sessão, com tenant cruzado negado",
        async () => {
          const session = await login(await fixture.createUser("scope"));
          assert.equal(
            (await post("context", session, { tenantId: fixture.tenantB }))
              .status,
            403,
          );
          const shared = await login(fixture.users.shared);
          assert.equal(shared.data.tenants.length, 2);
          const changed = await post("context", shared, {
            tenantId: fixture.tenantB,
          });
          assert.equal(changed.status, 200);
          assert.equal(changed.data.activeTenantId, fixture.tenantB);
          await fixture.admin.query(
            "UPDATE identity.memberships SET active=false WHERE user_id=$1 AND tenant_id=$2",
            [fixture.users.shared.id, fixture.tenantB],
          );
          const checked = await request("session", { cookie: shared.cookie });
          assert.equal(checked.data.tenants.length, 1);
          assert.equal(checked.data.activeTenantId, fixture.tenantA);
        },
      );
      await t.test(
        "sessões listam somente o próprio usuário e podem ser revogadas",
        async () => {
          const user = await fixture.createUser("sessions");
          const a = await login(user),
            b = await login(user),
            foreign = await login(fixture.users.other);
          const list = await request("sessions", { cookie: a.cookie });
          assert.equal(list.status, 200);
          assert.equal(list.data.length, 2);
          assert.ok(list.data.some((row) => row.current));
          assert.ok(!JSON.stringify(list.data).includes("token_hash"));
          await post("sessions/revoke", a, { sessionId: foreign.data.id });
          assert.equal(
            (await request("session", { cookie: foreign.cookie })).status,
            200,
          );
          assert.equal(
            (await post("sessions/revoke", a, { sessionId: b.data.id })).status,
            200,
          );
          assert.equal(
            (await request("session", { cookie: b.cookie })).status,
            401,
          );
          const logout = await post("logout", a);
          assert.equal(logout.status, 200);
          assert.match(logout.setCookie, /Max-Age=0/);
          assert.equal(
            (await request("session", { cookie: a.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "expiração absoluta, inatividade e conta desativada bloqueiam acesso",
        async () => {
          for (const [label, sql] of [
            [
              "absolute",
              "UPDATE identity.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
            ],
            [
              "idle",
              "UPDATE identity.sessions SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",
            ],
          ]) {
            const session = await login(await fixture.createUser(label));
            await fixture.admin.query(sql, [session.data.id]);
            assert.equal(
              (await request("session", { cookie: session.cookie })).status,
              401,
            );
          }
          const user = await fixture.createUser("deactivated");
          const session = await login(user);
          await fixture.admin.query(
            "UPDATE identity.users SET active=false WHERE id=$1",
            [user.id],
          );
          assert.equal(
            (await request("session", { cookie: session.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "administrador fica restrito até ativar MFA; QR e código rotacionam a sessão",
        async () => {
          const partial = await login(fixture.users.owner);
          assert.equal(partial.data.stage, "mfa_setup");
          assert.deepEqual(partial.data.tenants, []);
          assert.equal(
            (await request("sessions", { cookie: partial.cookie })).status,
            403,
          );
          const enrollment = await post("mfa/enroll", partial);
          assert.equal(enrollment.status, 200);
          assert.match(enrollment.data.qr, /^data:image\/png;base64,/);
          const code = totp(
            enrollment.data.secret,
            fixture.users.owner.email,
          ).generate();
          const complete = await post("mfa/verify", partial, { code });
          assert.equal(complete.status, 200);
          assert.equal(complete.data.stage, "authenticated");
          assert.notEqual(complete.cookie, partial.cookie);
          assert.equal(
            (await request("session", { cookie: partial.cookie })).status,
            401,
          );
          const stored = (
            await fixture.admin.query(
              "SELECT mfa_secret_enc FROM identity.credentials WHERE user_id=$1",
              [fixture.users.owner.id],
            )
          ).rows[0].mfa_secret_enc;
          assert.notEqual(stored, enrollment.data.secret);
          assert.equal(decrypt(stored, fixture.key), enrollment.data.secret);
          const next = await login(fixture.users.owner);
          assert.equal(next.data.stage, "mfa_challenge");
          assert.equal((await post("mfa/verify", next, { code })).status, 400);
          const newCode = totp(
            enrollment.data.secret,
            fixture.users.owner.email,
          ).generate({ timestamp: Date.now() + 30000 });
          const verified = await post("mfa/verify", next, { code: newCode });
          assert.equal(verified.status, 200);
        },
      );
      await t.test(
        "MFA opcional pede senha e encerra sessões antigas ao ser ativado",
        async () => {
          const user = await fixture.createUser("optional");
          const first = await login(user),
            other = await login(user);
          assert.equal(
            (
              await post("mfa/enroll", first, {
                password: "senha de teste incorreta",
              })
            ).status,
            401,
          );
          const enrollment = await post("mfa/enroll", first, {
            password: user.password,
          });
          assert.equal(enrollment.status, 200);
          const verified = await post("mfa/verify", first, {
            code: totp(enrollment.data.secret, user.email).generate(),
          });
          assert.equal(verified.status, 200);
          assert.equal(
            (await request("session", { cookie: other.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "recuperação não enumera contas nem devolve token no HTTP; fila é cifrada",
        async () => {
          const user = await fixture.createUser("recovery");
          const known = await request("forgot-password", {
              body: { email: user.email },
            }),
            unknown = await request("forgot-password", {
              body: { email: "unknown-recovery@example.invalid" },
            });
          assert.equal(known.status, 202);
          assert.deepEqual(known.data, unknown.data);
          const sent = await message(user.email);
          const token = tokenFrom(sent);
          assert.ok(token);
          assert.ok(!JSON.stringify(known.data).includes(token));
          const row = (
            await fixture.admin.query(
              "SELECT token_hash FROM identity.recovery_tokens WHERE user_id=$1",
              [user.id],
            )
          ).rows[0];
          assert.equal(row.token_hash, hashToken(token));
          const outbox = (
            await fixture.admin.query(
              "SELECT payload_enc FROM identity.mail_outbox WHERE user_id=$1",
              [user.id],
            )
          ).rows[0].payload_enc;
          assert.ok(!outbox.includes(token));
          assert.equal(JSON.parse(decrypt(outbox, fixture.key)).to, user.email);
        },
      );
      await t.test(
        "redefinição é de uso único, encerra acessos antigos e não entra automaticamente",
        async () => {
          const user = await fixture.createUser("reset");
          const old = await login(user),
            second = await login(user);
          await request("forgot-password", { body: { email: user.email } });
          const token = tokenFrom(await message(user.email));
          const password = "Outra senha ficticia para teste 2026!";
          const reset = await request("reset-password", {
            body: { token, password },
          });
          assert.equal(reset.status, 200);
          assert.match(reset.setCookie, /Max-Age=0/);
          assert.equal(
            (await request("session", { cookie: old.cookie })).status,
            401,
          );
          assert.equal(
            (await request("session", { cookie: second.cookie })).status,
            401,
          );
          assert.equal(
            (await request("reset-password", { body: { token, password } }))
              .status,
            400,
          );
          assert.equal((await login(user)).status, 401);
          assert.equal((await login({ ...user, password })).status, 200);
        },
      );
      await t.test(
        "recuperação expirada e duas confirmações concorrentes não reutilizam token",
        async () => {
          const user = await fixture.createUser("expired-recovery");
          await request("forgot-password", { body: { email: user.email } });
          const token = tokenFrom(await message(user.email));
          await fixture.admin.query(
            "UPDATE identity.recovery_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
            [user.id],
          );
          assert.equal(
            (
              await request("reset-password", {
                body: { token, password: "Senha de teste nova e segura 2026!" },
              })
            ).status,
            400,
          );
          const concurrent = await fixture.createUser("concurrent-reset");
          await request("forgot-password", {
            body: { email: concurrent.email },
          });
          const key = tokenFrom(await message(concurrent.email));
          const statuses = await Promise.all([
            request("reset-password", {
              body: { token: key, password: "Primeira senha de teste 2026!" },
            }),
            request("reset-password", {
              body: { token: key, password: "Segunda senha de teste 2026!" },
            }),
          ]);
          assert.deepEqual(
            statuses.map((row) => row.status).sort(),
            [200, 400],
          );
        },
      );
      await t.test(
        "recuperação não remove nem contorna MFA já configurado",
        async () => {
          const secret = newMfaSecret();
          const user = await fixture.createUser("protected-reset", {
            mfaRequired: true,
            secret,
          });
          await request("forgot-password", { body: { email: user.email } });
          const token = tokenFrom(await message(user.email));
          const password = "Senha protegida apenas de teste 2026!";
          assert.equal(
            (await request("reset-password", { body: { token, password } }))
              .status,
            400,
          );
          assert.equal(
            (
              await request("reset-password", {
                body: {
                  token,
                  password,
                  code: totp(secret, user.email).generate(),
                },
              })
            ).status,
            200,
          );
          const changed = await login({ ...user, password });
          assert.equal(changed.data.stage, "mfa_challenge");
          assert.deepEqual(changed.data.tenants, []);
        },
      );
      await t.test(
        "tentativas são limitadas e encerramento global revoga todos os dispositivos",
        async () => {
          const user = await fixture.createUser("limited");
          for (let i = 0; i < 8; i++)
            assert.equal(
              (await login({ ...user, password: "senha de teste incorreta" }))
                .status,
              401,
            );
          assert.equal((await login(user)).status, 429);
          const global = await fixture.createUser("global");
          const a = await login(global),
            b = await login(global);
          assert.equal((await post("sessions/revoke-all", a)).status, 200);
          assert.equal(
            (await request("session", { cookie: a.cookie })).status,
            401,
          );
          assert.equal(
            (await request("session", { cookie: b.cookie })).status,
            401,
          );
        },
      );
      await t.test(
        "papéis não permitem acesso comercial por identidade nem alteração de eventos",
        async () => {
          const auth = new pg.Client({ connectionString: fixture.authUrl }),
            business = new pg.Client({ connectionString: fixture.appUrl });
          await auth.connect();
          await business.connect();
          try {
            for (const query of [
              "UPDATE tenancy.tenants SET name='forbidden'",
              "SELECT * FROM tenancy.settings",
              "UPDATE identity.users SET active=false",
              "DELETE FROM identity.auth_events",
              "UPDATE identity.auth_events SET event_type='logout'",
            ])
              await assert.rejects(
                auth.query(query),
                (error) => error.code === "42501",
              );
            for (const query of [
              "SELECT * FROM identity.credentials",
              "SELECT * FROM identity.sessions",
              "SELECT * FROM identity.recovery_tokens",
            ])
              await assert.rejects(
                business.query(query),
                (error) => error.code === "42501",
              );
          } finally {
            await auth.end();
            await business.end();
          }
        },
      );
    } finally {
      await app.close();
      await fixture.admin.end();
    }
  },
);

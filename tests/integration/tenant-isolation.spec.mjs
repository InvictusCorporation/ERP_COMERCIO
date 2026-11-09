import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdtemp, copyFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { readLocalConfig } from "../../scripts/database/local-config.mjs";
import { provision } from "../../scripts/database/provision.mjs";
import { runtimeEnvironment } from "../../scripts/runtime-environment.mjs";
import {
  migrate,
  migrationDirectory,
} from "../../scripts/database/migrations.mjs";
import {
  TenantDatabase,
  TenantAccessDenied,
} from "../../apps/api/dist/database/tenant-database.js";
import { TenancyRepository } from "../../apps/api/dist/modules/tenancy/tenancy.repository.js";
import { AppModule } from "../../apps/api/dist/app.module.js";
import { createApplication } from "../../apps/api/dist/application.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
const ctxA = { tenantId: A, userId: userA },
  ctxB = { tenantId: B, userId: userB };
const memberA = "a1111111-1111-4111-8111-111111111111",
  memberB = "b2222222-2222-4222-8222-222222222222";
const idB = "b5555555-5555-4555-8555-555555555555";
const hasCode = (code) => (error) => error?.code === code;

test(
  "PostgreSQL real: migrações, papéis e isolamento multiempresa",
  { timeout: 120000 },
  async (t) => {
    const config = readLocalConfig();
    const databaseName = "invictus_test_" + randomBytes(8).toString("hex");
    await provision({
      ...config,
      database: databaseName,
      createDatabase: true,
    });
    const forDatabase = (url) => {
      const value = new URL(url);
      value.pathname = "/" + databaseName;
      return value.href;
    };
    const migrationUrl = forDatabase(config.migrationUrl),
      appUrl = forDatabase(config.appUrl);
    const admin = new pg.Client({
      connectionString: forDatabase(config.adminUrl),
    });
    await admin.connect();
    const database = new TenantDatabase(appUrl, 1);
    const raw = new pg.Pool({ connectionString: appUrl, max: 1 });
    const repository = new TenancyRepository(database);
    const read = (context) =>
      database.withTenant(
        context,
        async (client) =>
          (
            await client.query(
              "SELECT tenant_id, key, value FROM tenancy.settings",
            )
          ).rows,
      );
    try {
      await t.test(
        "segredos de bootstrap e migração não são herdados pelos serviços",
        async () => {
          const source = {
            PATH: "path-preservado",
            DATABASE_URL: "restricted-test-url",
            POSTGRES_PASSWORD: "bootstrap-test-only",
            PGPASSWORD: "other-test-only",
            MIGRATION_DATABASE_URL: "migration-test-only",
          };
          for (const target of ["api", "web"]) {
            const env = runtimeEnvironment(source, target);
            assert.equal(env.POSTGRES_PASSWORD, undefined);
            assert.equal(env.PGPASSWORD, undefined);
            assert.equal(env.MIGRATION_DATABASE_URL, undefined);
            assert.equal(env.PATH, source.PATH);
            assert.equal(
              env.DATABASE_URL,
              target === "api" ? source.DATABASE_URL : undefined,
            );
          }
        },
      );
      await t.test("migração aplica uma vez e verifica checksum", async () => {
        const partialDirectory = await mkdtemp(".local/partial-migration-");
        await copyFile(
          join(migrationDirectory, "001_identity_tenancy.sql"),
          join(partialDirectory, "001_identity_tenancy.sql"),
        );
        assert.equal((await migrate(migrationUrl, partialDirectory)).length, 1);
        assert.equal(await database.isAvailable(), false);
        await assert.rejects(
          database.withTenant(ctxA, async () => {}),
          /papel de execução restrito/,
        );
        assert.equal((await migrate(migrationUrl)).length, 1);
        assert.deepEqual(await migrate(migrationUrl), []);
        const directory = await mkdtemp(".local/migration-test-");
        for (const file of ["001_identity_tenancy.sql", "002_rls.sql"])
          await copyFile(join(migrationDirectory, file), join(directory, file));
        await writeFile(
          join(directory, "001_identity_tenancy.sql"),
          (await readFile(
            join(directory, "001_identity_tenancy.sql"),
            "utf8",
          )) + "\n-- checksum alterado\n",
        );
        await assert.rejects(
          migrate(migrationUrl, directory),
          /já aplicada foi alterada/,
        );
        await copyFile(
          join(migrationDirectory, "001_identity_tenancy.sql"),
          join(directory, "001_identity_tenancy.sql"),
        );
        await writeFile(
          join(directory, "003_failure.sql"),
          "CREATE TABLE tenancy.rollback_probe(id integer); SELECT 1/0;",
        );
        await assert.rejects(
          migrate(migrationUrl, directory),
          hasCode("22012"),
        );
        assert.equal(
          (
            await admin.query(
              "SELECT to_regclass('tenancy.rollback_probe') AS table_name",
            )
          ).rows[0].table_name,
          null,
        );
        assert.equal(
          (
            await admin.query(
              "SELECT count(*)::int AS count FROM infra.schema_migrations",
            )
          ).rows[0].count,
          2,
        );
      });
      await admin.query(
        await readFile("database/seeds/test-tenants.sql", "utf8"),
      );
      await t.test(
        "papel real da API sem privilégios, DDL ou acesso à identidade global",
        async () => {
          const role = (
            await raw.query(
              "SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
            )
          ).rows[0];
          assert.deepEqual(role, {
            name: "invictus_app",
            rolsuper: false,
            rolbypassrls: false,
            rolcreatedb: false,
            rolcreaterole: false,
          });
          for (const sql of [
            "SELECT * FROM identity.users",
            "CREATE TABLE tenancy.forbidden(id int)",
            "SET ROLE invictus_migrator",
            "TRUNCATE tenancy.settings",
            "UPDATE identity.memberships SET active=false",
          ])
            await assert.rejects(raw.query(sql), hasCode("42501"));
          const rls = (
            await admin.query(
              "SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('identity','tenancy') AND c.relname IN ('memberships','tenants','settings')",
            )
          ).rows;
          assert.equal(rls.length, 3);
          assert.ok(
            rls.every((row) => row.relrowsecurity && row.relforcerowsecurity),
          );
        },
      );
      await t.test("sem contexto nega leitura e escrita", async () => {
        assert.equal(
          (await raw.query("SELECT * FROM tenancy.settings")).rowCount,
          0,
        );
        assert.equal(
          (await raw.query("SELECT * FROM tenancy.tenants")).rowCount,
          0,
        );
        assert.equal(
          (await raw.query("UPDATE tenancy.settings SET value='null'"))
            .rowCount,
          0,
        );
        assert.equal(
          (await raw.query("DELETE FROM tenancy.settings")).rowCount,
          0,
        );
        await assert.rejects(
          raw.query(
            "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
            [A, "blocked", "null", memberA],
          ),
          hasCode("42501"),
        );
      });
      await t.test(
        "cada cliente vê somente seus registros, inclusive IDs adulterados",
        async () => {
          assert.equal((await repository.current(ctxA)).id, A);
          assert.equal((await repository.current(ctxB)).id, B);
          assert.deepEqual(
            (await read(ctxA)).map((row) => row.value),
            ["Empresa A"],
          );
          assert.deepEqual(
            (await read(ctxB)).map((row) => row.value),
            ["Empresa B"],
          );
          await database.withTenant(ctxA, async (client) => {
            assert.equal(
              (
                await client.query(
                  "SELECT * FROM tenancy.settings WHERE id=$1",
                  [idB],
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await client.query(
                  "UPDATE tenancy.settings SET value='null' WHERE id=$1",
                  [idB],
                )
              ).rowCount,
              0,
            );
            assert.equal(
              (
                await client.query("DELETE FROM tenancy.settings WHERE id=$1", [
                  idB,
                ])
              ).rowCount,
              0,
            );
          });
        },
      );
      await t.test(
        "tenant falsificado e contexto inválido são recusados antes da operação",
        async () => {
          let executed = false;
          for (const context of [
            { userId: userA, tenantId: B },
            { userId: userA, tenantId: "';SET ROLE invictus_migrator;--" },
            null,
          ]) {
            await assert.rejects(
              database.withTenant(context, async () => {
                executed = true;
              }),
              TenantAccessDenied,
            );
          }
          assert.equal(executed, false);
          const client = await raw.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              "SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",
              [userA, B],
            );
            assert.equal(
              (await client.query("SELECT * FROM tenancy.settings")).rowCount,
              0,
            );
            await assert.rejects(
              client.query(
                "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
                [B, "forged", "null", memberB],
              ),
              hasCode("42501"),
            );
          } finally {
            await client.query("ROLLBACK");
            client.release();
          }
        },
      );
      await t.test(
        "INSERT e mudança de tenant bloqueados por WITH CHECK",
        async () => {
          await assert.rejects(
            database.withTenant(ctxA, (client) =>
              client.query(
                "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
                [B, "cross", "null", memberB],
              ),
            ),
            hasCode("42501"),
          );
          await assert.rejects(
            database.withTenant(ctxA, (client) =>
              client.query(
                "UPDATE tenancy.settings SET tenant_id=$1,updated_by=$2",
                [B, memberB],
              ),
            ),
            hasCode("42501"),
          );
          assert.deepEqual(
            (await read(ctxB)).map((row) => row.value),
            ["Empresa B"],
          );
        },
      );
      await t.test(
        "FK composta impede referência a vínculo de outro tenant",
        async () => {
          await assert.rejects(
            database.withTenant(ctxA, (client) =>
              client.query(
                "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
                [A, "bad.reference", "null", memberB],
              ),
            ),
            hasCode("23503"),
          );
        },
      );
      await t.test(
        "CRUD autorizado funciona e unicidade é por empresa",
        async () => {
          await database.withTenant(ctxA, async (client, membership) => {
            await client.query(
              "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
              [A, "local.setting", "1", membership],
            );
            assert.equal(
              (
                await client.query(
                  "UPDATE tenancy.settings SET value='2' WHERE key=$1",
                  ["local.setting"],
                )
              ).rowCount,
              1,
            );
            assert.equal(
              (
                await client.query(
                  "DELETE FROM tenancy.settings WHERE key=$1",
                  ["local.setting"],
                )
              ).rowCount,
              1,
            );
          });
          await assert.rejects(
            database.withTenant(ctxA, (client) =>
              client.query(
                "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
                [A, "business.name", "null", memberA],
              ),
            ),
            hasCode("23505"),
          );
          assert.equal((await repository.settings(ctxB)).length, 1);
        },
      );
      await t.test("rollback e reuso do pool não vazam contexto", async () => {
        await assert.rejects(
          database.withTenant(ctxA, async (client, membership) => {
            await client.query(
              "INSERT INTO tenancy.settings(tenant_id,key,value,updated_by) VALUES($1,$2,$3,$4)",
              [A, "rollback.check", "null", membership],
            );
            throw new Error("rollback solicitado no teste");
          }),
          /rollback solicitado/,
        );
        assert.equal((await read(ctxA)).length, 1);
        const pids = [];
        for (const context of [ctxA, ctxB, ctxA, ctxB])
          await database.withTenant(context, async (client) => {
            const row = (
              await client.query(
                "SELECT pg_backend_pid() AS pid,current_setting('app.tenant_id') AS tenant",
              )
            ).rows[0];
            pids.push(row.pid);
            assert.equal(row.tenant, context.tenantId);
          });
        assert.equal(new Set(pids).size, 1);
        // Inspeção de segurança do pool privado somente neste teste de integração.
        const cleared = (
          await database.pool.query(
            "SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant,nullif(current_setting('app.user_id',true),'') AS actor",
          )
        ).rows[0];
        assert.deepEqual(cleared, { tenant: null, actor: null });
        assert.equal(
          (await database.pool.query("SELECT * FROM tenancy.settings"))
            .rowCount,
          0,
        );
      });
      await t.test(
        "requisições concorrentes preservam os escopos",
        async () => {
          const parallel = new TenantDatabase(appUrl, 4);
          try {
            await Promise.all(
              Array.from({ length: 24 }, (_, i) =>
                parallel.withTenant(i % 2 ? ctxA : ctxB, async (client) => {
                  const rows = (
                    await client.query("SELECT tenant_id FROM tenancy.settings")
                  ).rows;
                  assert.ok(rows.length > 0);
                  assert.ok(
                    rows.every((row) => row.tenant_id === (i % 2 ? A : B)),
                  );
                }),
              ),
            );
          } finally {
            await parallel.close();
          }
        },
      );
      await t.test(
        "usuário, vínculo e empresa inativos perdem acesso",
        async () => {
          await assert.rejects(
            read({
              tenantId: A,
              userId: "44444444-4444-4444-8444-444444444444",
            }),
            TenantAccessDenied,
          );
          for (const [sql, values, restore] of [
            [
              "UPDATE identity.memberships SET active=false WHERE tenant_id=$1 AND user_id=$2",
              [A, userA],
              "UPDATE identity.memberships SET active=true WHERE tenant_id=$1 AND user_id=$2",
            ],
            [
              "UPDATE tenancy.tenants SET active=false WHERE id=$1",
              [A],
              "UPDATE tenancy.tenants SET active=true WHERE id=$1",
            ],
          ]) {
            await admin.query(sql, values);
            try {
              await assert.rejects(read(ctxA), TenantAccessDenied);
            } finally {
              await admin.query(restore, values);
            }
          }
        },
      );
      await t.test(
        "pessoa vinculada a duas empresas recebe escopos independentes",
        async () => {
          const userId = "33333333-3333-4333-8333-333333333333";
          assert.deepEqual(
            (await read({ tenantId: A, userId })).map((row) => row.value),
            ["Empresa A"],
          );
          assert.deepEqual(
            (await read({ tenantId: B, userId })).map((row) => row.value),
            ["Empresa B"],
          );
        },
      );
      await t.test(
        "readiness com banco real exige papel restrito e endpoints de negócio seguem fechados",
        async () => {
          assert.equal(await database.isAvailable(), true);
          const privileged = new TenantDatabase(forDatabase(config.adminUrl));
          try {
            assert.equal(await privileged.isAvailable(), false);
          } finally {
            await privileged.close();
          }
          const app = await createApplication(
            AppModule.register(appUrl),
            false,
          );
          try {
            await app.listen(0, "127.0.0.1");
            const url = await app.getUrl();
            const response = await fetch(url + "/api/v1/health/ready");
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
              status: "ready",
              checks: { database: "up" },
            });
            assert.equal((await fetch(url + "/api/v1/tenants")).status, 404);
          } finally {
            await app.close();
          }
        },
      );
      await writeFile(
        ".local/latest-integration.json",
        JSON.stringify(
          {
            database: databaseName,
            postgres: (await admin.query("SHOW server_version")).rows[0]
              .server_version,
            passed: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await database.close();
      await raw.end();
      await admin.end();
    }
    // Banco fictício preservado para inspeção: não apagar históricos nem usar DROP.
  },
);

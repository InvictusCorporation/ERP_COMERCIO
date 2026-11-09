import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { readLocalConfig } from "../../scripts/database/local-config.mjs";
import { provision } from "../../scripts/database/provision.mjs";
import { mkdtemp, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  migrate,
  migrationDirectory,
} from "../../scripts/database/migrations.mjs";
import { TEST_PASSWORD } from "./test-credentials.mjs";
export async function authDatabase(
  origin = "http://127.0.0.1:3001",
  { beforeAudit = false } = {},
) {
  const local = readLocalConfig();
  const name = "invictus_test_" + randomBytes(8).toString("hex");
  await provision({ ...local, database: name, createDatabase: true });
  const databaseUrl = (url) => {
    const result = new URL(url);
    result.pathname = "/" + name;
    return result.href;
  };
  const appUrl = databaseUrl(local.appUrl),
    authUrl = databaseUrl(local.authUrl),
    adminUrl = databaseUrl(local.adminUrl);
  if (beforeAudit) {
    const directory = await mkdtemp(".local/before-audit-");
    for (const file of await readdir(migrationDirectory))
      if (/^00[1-5]_.*\.sql$/.test(file))
        await copyFile(join(migrationDirectory, file), join(directory, file));
    await migrate(databaseUrl(local.migrationUrl), directory);
  } else await migrate(databaseUrl(local.migrationUrl));
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const { hashPassword, encrypt } =
    await import("../../apps/api/dist/modules/identity/crypto.js");
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const key = randomBytes(32).toString("hex");
  const tenantA = randomUUID(),
    tenantB = randomUUID();
  await admin.query(
    "DO $$ BEGIN IF current_database() !~ '^invictus_test_[a-f0-9]{16}$' THEN RAISE EXCEPTION 'Banco de teste obrigatório'; END IF; END $$",
  );
  await admin.query(
    "INSERT INTO tenancy.tenants(id,name) VALUES($1,$2),($3,$4)",
    [tenantA, "Comércio de Teste A", tenantB, "Supermercado de Teste B"],
  );
  async function createUser(
    label,
    {
      mfaRequired = false,
      active = true,
      tenant = tenantA,
      shared = false,
      secret,
    } = {},
  ) {
    const id = randomUUID(),
      email = label + "@example.invalid";
    await admin.query(
      "INSERT INTO identity.users(id,email,display_name,active) VALUES($1,$2,$3,$4)",
      [id, email, "Usuário de teste " + label, active],
    );
    await admin.query(
      "INSERT INTO identity.credentials(user_id,password_hash,mfa_required,mfa_secret_enc,mfa_enabled_at) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        passwordHash,
        mfaRequired,
        secret ? encrypt(secret, key) : null,
        secret ? new Date() : null,
      ],
    );
    if (tenant)
      await admin.query(
        "INSERT INTO identity.memberships(tenant_id,user_id,is_owner) VALUES($1,$2,$3)",
        [tenant, id, mfaRequired],
      );
    if (shared)
      await admin.query(
        "INSERT INTO identity.memberships(tenant_id,user_id) VALUES($1,$2)",
        [tenantB, id],
      );
    return { id, email, password: TEST_PASSWORD };
  }
  const users = {
    normal: await createUser("normal"),
    owner: await createUser("owner", { mfaRequired: true }),
    other: await createUser("other", { tenant: tenantB }),
    inactive: await createUser("inactive", { active: false }),
    shared: await createUser("shared", { shared: true }),
  };
  return {
    name,
    admin,
    adminUrl,
    appUrl,
    authUrl,
    migrationUrl: databaseUrl(local.migrationUrl),
    tenantA,
    tenantB,
    key,
    users,
    createUser,
    config: {
      databaseUrl: authUrl,
      encryptionKey: key,
      origin,
      mailTransport: "local",
    },
  };
}

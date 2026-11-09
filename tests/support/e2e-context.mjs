import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { readLocalConfig } from "../../scripts/database/local-config.mjs";
import {
  decrypt,
  hashPassword,
} from "../../apps/api/dist/modules/identity/crypto.js";
import { TEST_PASSWORD } from "./test-credentials.mjs";
export function e2eContext() {
  const local = readLocalConfig();
  const fixture = JSON.parse(
    decrypt(readFileSync(".local/e2e-fixture.enc", "utf8"), local.authKey),
  );
  if (!/^invictus_test_[a-f0-9]{16}$/.test(fixture.name))
    throw new Error("Fixture inválida.");
  return fixture;
}
export async function createE2EUser({
  mfaRequired = false,
  isolatedTenant = false,
  tenantId = null,
} = {}) {
  const fixture = e2eContext();
  const client = new pg.Client({ connectionString: fixture.adminUrl });
  await client.connect();
  const id = randomUUID(),
    email = "browser-" + id + "@example.invalid";
  try {
    if (
      (await client.query("SELECT current_database() AS name")).rows[0].name !==
      fixture.name
    )
      throw new Error("Banco incorreto.");
    await client.query("BEGIN");
    const targetTenant = isolatedTenant
      ? randomUUID()
      : tenantId || fixture.tenantA;
    if (isolatedTenant)
      await client.query("INSERT INTO tenancy.tenants(id,name) VALUES($1,$2)", [
        targetTenant,
        "Rede Invictus · Teste de interface",
      ]);
    await client.query(
      "INSERT INTO identity.users(id,email,display_name) VALUES($1,$2,$3)",
      [id, email, "Operador de teste"],
    );
    await client.query(
      "INSERT INTO identity.credentials(user_id,password_hash,mfa_required) VALUES($1,$2,$3)",
      [id, await hashPassword(TEST_PASSWORD), mfaRequired],
    );
    await client.query(
      "INSERT INTO identity.memberships(tenant_id,user_id,is_owner) VALUES($1,$2,$3)",
      [targetTenant, id, mfaRequired],
    );
    await client.query("COMMIT");
    return { id, email, password: TEST_PASSWORD, tenantId: targetTenant };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
export async function latestE2ERecovery(email) {
  const fixture = e2eContext();
  const client = new pg.Client({ connectionString: fixture.authUrl });
  await client.connect();
  try {
    const row = (
      await client.query(
        "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
    ).rows[0];
    if (!row) throw new Error("Mensagem fictícia ausente.");
    return JSON.parse(decrypt(row.payload_enc, fixture.key)).url;
  } finally {
    await client.end();
  }
}

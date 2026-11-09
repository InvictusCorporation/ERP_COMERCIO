import pg from "pg";
import { readLocalConfig } from "./database/local-config.mjs";
import { requireInteractive, prompt, secret } from "./interactive-input.mjs";
import {
  validPassword,
  hashPassword,
} from "../apps/api/dist/modules/identity/crypto.js";
async function main() {
  requireInteractive();
  const config = readLocalConfig();
  const company = await prompt("Nome da empresa: ");
  const name = await prompt("Nome do administrador: ");
  const email = (await prompt("E-mail do administrador: ")).toLowerCase();
  if (
    !company ||
    company.length > 160 ||
    !name ||
    name.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new Error("Confira nome, empresa e e-mail.");
  const password = await secret(
    "Senha (12 a 128 caracteres; entrada oculta): ",
  );
  const confirm = await secret("Confirme a senha (entrada oculta): ");
  if (!validPassword(password) || password !== confirm)
    throw new Error("Senha inválida ou confirmação diferente.");
  const passwordHash = await hashPassword(password);
  const url = new URL(config.adminUrl);
  url.pathname = "/" + config.database;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(819072,14)");
    const count = (
      await client.query(
        "SELECT (SELECT count(*) FROM identity.users)+(SELECT count(*) FROM tenancy.tenants) AS count",
      )
    ).rows[0].count;
    if (Number(count) !== 0)
      throw new Error(
        "O bootstrap exige banco local sem usuários e empresas. Nenhum cadastro foi substituído.",
      );
    const tenant = (
      await client.query(
        "INSERT INTO tenancy.tenants(name) VALUES($1) RETURNING id",
        [company],
      )
    ).rows[0];
    const user = (
      await client.query(
        "INSERT INTO identity.users(email,display_name) VALUES($1,$2) RETURNING id",
        [email, name],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO identity.credentials(user_id,password_hash,mfa_required) VALUES($1,$2,true)",
      [user.id, passwordHash],
    );
    await client.query(
      "INSERT INTO identity.memberships(tenant_id,user_id,is_owner) VALUES($1,$2,true)",
      [tenant.id, user.id],
    );
    await client.query("COMMIT");
    console.log(
      "Administrador e empresa criados. Entre pela tela de login e configure o autenticador para concluir o acesso.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      /bootstrap|Senha|Confira|terminal|cancelada/.test(error.message)
      ? error.message
      : "Não foi possível criar o administrador. Confira o banco local e as migrações.",
  );
  process.exitCode = 1;
});

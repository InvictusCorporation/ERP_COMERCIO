import pg from "pg";

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";

// Apenas bootstrap local ou banco de teste recém-criado. Não altera senha de
// papel existente: discrepâncias falham para não quebrar outros ambientes.
export async function provision({
  adminUrl,
  database,
  appPassword,
  migrationPassword,
  createDatabase = false,
}) {
  if (!/^invictus_(dev|test_[a-f0-9]{16})$/.test(database))
    throw new Error("Nome de banco local não permitido.");
  for (const value of [appPassword, migrationPassword])
    if (!/^[a-f0-9]{64}$/.test(value))
      throw new Error("Credencial local inválida.");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query("SELECT pg_advisory_lock(819072, 13)");
    for (const [name, password] of [
      ["invictus_migrator", migrationPassword],
      ["invictus_app", appPassword],
    ]) {
      const existing = (
        await admin.query(
          "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit, EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS role_membership FROM pg_roles WHERE rolname=$1",
          [name],
        )
      ).rows[0];
      if (!existing)
        await admin.query(
          `CREATE ROLE ${quote(name)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)}`,
        );
      else if (Object.values(existing).some(Boolean))
        throw new Error(`Papel ${name} tem privilégios incompatíveis.`);
    }
    const exists = (
      await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        database,
      ])
    ).rowCount;
    if (!exists) {
      if (!createDatabase) throw new Error("Banco local ausente.");
      await admin.query(
        `CREATE DATABASE ${quote(database)} OWNER invictus_migrator`,
      );
    }
    // Nunca alterar o proprietário de um banco já existente.
    await admin.query(`REVOKE ALL ON DATABASE ${quote(database)} FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT, CREATE ON DATABASE ${quote(database)} TO invictus_migrator`,
    );
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quote(database)} TO invictus_app`,
    );
  } finally {
    await admin.query("SELECT pg_advisory_unlock(819072, 13)").catch(() => {});
    await admin.end();
  }
  const target = new URL(adminUrl);
  target.pathname = "/" + database;
  const client = new pg.Client({ connectionString: target.href });
  await client.connect();
  try {
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  } finally {
    await client.end();
  }
}

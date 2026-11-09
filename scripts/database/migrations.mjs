import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";

export const migrationDirectory = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);
export async function migrate(
  connectionString,
  directory = migrationDirectory,
) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const role = (await client.query("SELECT current_user AS name")).rows[0];
    if (role.name !== "invictus_migrator")
      throw new Error("Migrações exigem o papel invictus_migrator.");
    // Lock de sessão serializa migradores, inclusive a criação da tabela de controle.
    await client.query("SELECT pg_advisory_lock(819072, 12)");
    await client.query(`CREATE SCHEMA IF NOT EXISTS infra;
      REVOKE ALL ON SCHEMA infra FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS infra.schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      ); REVOKE ALL ON infra.schema_migrations FROM PUBLIC;`);
    const names = (await readdir(directory))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    const applied = [];
    for (const name of names) {
      const sql = await readFile(join(directory, name), "utf8");
      const checksum = createHash("sha256")
        .update(sql.replaceAll("\r\n", "\n"))
        .digest("hex");
      const previous = (
        await client.query(
          "SELECT checksum FROM infra.schema_migrations WHERE name = $1",
          [name],
        )
      ).rows[0];
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Migração já aplicada foi alterada: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO infra.schema_migrations(name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(819072, 12)").catch(() => {});
    await client.end();
  }
}

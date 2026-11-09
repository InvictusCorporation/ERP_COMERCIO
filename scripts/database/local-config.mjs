import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

export function readLocalConfig() {
  if (!existsSync(".env")) throw new Error("Execute npm run setup:local.");
  const base = parseEnv(readFileSync(".env", "utf8"));
  if (base.NODE_ENV !== "development")
    throw new Error("Ferramenta exclusiva de desenvolvimento local.");
  if (
    !/^invictus_dev$/.test(base.POSTGRES_DB || "") ||
    !/^[a-z_][a-z0-9_]*$/.test(base.POSTGRES_USER || "") ||
    !base.POSTGRES_PASSWORD ||
    base.POSTGRES_PASSWORD.includes("SUBSTITUA_")
  )
    throw new Error("Configuração PostgreSQL local inválida.");
  const port = Number(base.POSTGRES_PORT || 55432);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("POSTGRES_PORT inválida.");
  mkdirSync(".local", { recursive: true });
  const url = (user, password, database) => {
    const value = new URL(`postgresql://127.0.0.1:${port}/${database}`);
    value.username = user;
    value.password = password;
    return value.href;
  };
  if (!existsSync(".env.database")) {
    const appPassword = randomBytes(32).toString("hex");
    const migrationPassword = randomBytes(32).toString("hex");
    writeFileSync(
      ".env.database",
      `DATABASE_URL=${url("invictus_app", appPassword, base.POSTGRES_DB)}\nMIGRATION_DATABASE_URL=${url("invictus_migrator", migrationPassword, base.POSTGRES_DB)}\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  const credentials = parseEnv(readFileSync(".env.database", "utf8"));
  for (const [key, role] of [
    ["DATABASE_URL", "invictus_app"],
    ["MIGRATION_DATABASE_URL", "invictus_migrator"],
  ]) {
    const value = new URL(credentials[key]);
    if (
      value.username !== role ||
      value.hostname !== "127.0.0.1" ||
      Number(value.port) !== port ||
      value.pathname !== "/invictus_dev"
    )
      throw new Error(
        "Credenciais locais inconsistentes. Não foram sobrescritas.",
      );
  }
  return {
    port,
    user: base.POSTGRES_USER,
    password: base.POSTGRES_PASSWORD,
    database: base.POSTGRES_DB,
    adminUrl: url(base.POSTGRES_USER, base.POSTGRES_PASSWORD, "postgres"),
    appUrl: credentials.DATABASE_URL,
    migrationUrl: credentials.MIGRATION_DATABASE_URL,
    appPassword: new URL(credentials.DATABASE_URL).password,
    migrationPassword: new URL(credentials.MIGRATION_DATABASE_URL).password,
  };
}

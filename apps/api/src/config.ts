export type ApiConfig = { host: string; port: number; databaseUrl: string };
export function readConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const errors: string[] = [];
  const port = Number(env.API_PORT || "3333");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.push("API_PORT inválida");
  const host = env.API_HOST || "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1"].includes(host))
    errors.push("API_HOST inválido");
  const databaseUrl = env.DATABASE_URL || "";
  try {
    const url = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      !url.username ||
      !url.password
    )
      throw new Error();
    if (url.password.includes("SUBSTITUA_")) throw new Error();
  } catch {
    errors.push("DATABASE_URL ausente ou inválida");
  }
  if (errors.length)
    throw new Error(
      `Configuração inválida: ${errors.join("; ")}. Consulte .env.example.`,
    );
  return { host, port, databaseUrl };
}

export function runtimeEnvironment(source, target) {
  const env = { ...source, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("POSTGRES_") ||
      key === "PGPASSWORD" ||
      key === "MIGRATION_DATABASE_URL"
    )
      delete env[key];
  }
  if (target === "web") delete env.DATABASE_URL;
  return env;
}

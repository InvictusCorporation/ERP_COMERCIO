import { readLocalConfig } from "./local-config.mjs";
import { provision } from "./provision.mjs";
import { migrate } from "./migrations.mjs";
export async function prepareLocalDatabase() {
  const config = readLocalConfig();
  await provision({ ...config, createDatabase: true });
  const applied = await migrate(config.migrationUrl);
  console.log(
    `Banco local preparado: ${applied.length} migração(ões) aplicada(s). Nenhum dado comercial criado.`,
  );
  return config;
}

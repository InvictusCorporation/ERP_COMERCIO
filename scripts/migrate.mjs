import { prepareLocalDatabase } from "./database/prepare.mjs";
prepareLocalDatabase().catch(() => {
  console.error(
    "Falha ao preparar banco. Verifique o serviço local e as credenciais privadas; nenhum segredo será impresso.",
  );
  process.exitCode = 1;
});

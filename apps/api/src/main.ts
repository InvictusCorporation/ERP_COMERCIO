import "reflect-metadata";
import { readConfig } from "./config";
import { AppModule } from "./app.module";
import { createApplication } from "./application";

async function main() {
  let config;
  try {
    config = readConfig(process.env);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Configuração inválida.",
    );
    process.exitCode = 1;
    return;
  }
  const app = await createApplication(AppModule.register(config.databaseUrl));
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  console.log(
    `API local: http://${config.host}:${config.port}/api/v1/health/live`,
  );
}
main().catch(() => {
  console.error(
    "Não foi possível iniciar a API. Verifique a configuração e a disponibilidade da porta.",
  );
  process.exitCode = 1;
});

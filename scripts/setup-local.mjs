import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import net from "node:net";

if (existsSync(".env")) {
  console.log(".env já existe. Nenhuma configuração foi substituída.");
  process.exit(0);
}
async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Porta ${port} ocupada. Configure portas livres manualmente a partir de .env.example.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
try {
  for (const port of [3000, 3333, 55432]) await checkPort(port);
  const password = randomBytes(32).toString("hex");
  const content = `NODE_ENV=development\nAPI_HOST=127.0.0.1\nAPI_PORT=3333\nWEB_PORT=3000\nAPI_INTERNAL_URL=http://127.0.0.1:3333\nPOSTGRES_PORT=55432\nPOSTGRES_DB=invictus_dev\nPOSTGRES_USER=invictus_bootstrap\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://invictus_bootstrap:${password}@127.0.0.1:55432/invictus_dev\n`;
  writeFileSync(".env", content, { flag: "wx", mode: 0o600 });
  console.log(
    ".env local criado com senha aleatória. Não compartilhe esse arquivo.",
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Não foi possível preparar o ambiente.",
  );
  process.exitCode = 1;
}

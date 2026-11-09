import pg from "pg";
import { readLocalConfig } from "./database/local-config.mjs";
import { requireInteractive, prompt } from "./interactive-input.mjs";
import { decrypt } from "../apps/api/dist/modules/identity/crypto.js";
async function main() {
  requireInteractive();
  const config = readLocalConfig();
  const email = (
    await prompt("E-mail da conta para consultar a mensagem local: ")
  ).toLowerCase();
  const client = new pg.Client({ connectionString: config.authUrl });
  await client.connect();
  try {
    const row = (
      await client.query(
        "SELECT payload_enc FROM identity.mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
    ).rows[0];
    if (!row) {
      console.log("Nenhuma mensagem local encontrada.");
      return;
    }
    const message = JSON.parse(decrypt(row.payload_enc, config.authKey));
    process.stdout.write(
      "\nMensagem local de acesso (não compartilhe este link):\n" +
        message.url +
        "\n",
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Consulta disponível somente em terminal interativo local, com o banco deste projeto ativo.",
  );
  process.exitCode = 1;
});

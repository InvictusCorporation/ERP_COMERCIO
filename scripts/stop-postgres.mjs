import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { readLocalConfig } from "./database/local-config.mjs";

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Use o gerenciamento do seu PostgreSQL neste sistema.");
  const config = readLocalConfig();
  const expected = resolve(".local/postgres");
  const marker = JSON.parse(readFileSync(".local/postgres-owner.json", "utf8"));
  if (
    marker.directory !== expected ||
    marker.port !== config.port ||
    marker.user !== config.user
  )
    throw new Error(
      "Identificação local inválida; nenhum processo foi encerrado.",
    );
  const client = new pg.Client({
    connectionString: config.adminUrl,
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    const actual = (await client.query("SHOW data_directory")).rows[0]
      .data_directory;
    if (resolve(actual).toLowerCase() !== expected.toLowerCase())
      throw new Error("O processo não pertence ao diretório esperado.");
  } finally {
    await client.end();
  }
  const { pg_ctl } = await import("@embedded-postgres/windows-x64");
  await new Promise((yes, no) => {
    const child = spawn(
      pg_ctl,
      ["stop", "-D", expected, "-m", "fast", "-w", "-t", "15"],
      { windowsHide: true, stdio: "ignore" },
    );
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0 ? yes() : no(new Error("Falha ao confirmar parada.")),
    );
  });
  console.log("PostgreSQL portátil encerrado. Dados preservados.");
}
main().catch(() => {
  console.error(
    "Não foi possível confirmar a parada do PostgreSQL deste projeto. Nenhum processo alheio foi encerrado.",
  );
  process.exitCode = 1;
});

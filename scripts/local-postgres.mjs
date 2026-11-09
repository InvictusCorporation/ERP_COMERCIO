import { spawn } from "node:child_process";
import {
  existsSync,
  writeFileSync,
  unlinkSync,
  createWriteStream,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import pg from "pg";
import { readLocalConfig } from "./database/local-config.mjs";
import { prepareLocalDatabase } from "./database/prepare.mjs";

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Use Docker neste sistema.");
  const { initdb, postgres, pg_ctl } = await import(
    "@embedded-postgres/windows-x64"
  );
  const config = readLocalConfig();
  await new Promise((yes, no) => {
    const check = net.createServer();
    check.once("error", () =>
      no(new Error("Porta ocupada. Nenhum serviço foi alterado.")),
    );
    check.listen(config.port, "127.0.0.1", () => check.close(yes));
  });
  const directory = resolve(".local/postgres");
  const marker = resolve(".local/postgres-owner.json");
  if (existsSync(directory) && !existsSync(marker))
    throw new Error("Diretório sem identificação; não será inicializado.");
  if (existsSync(marker)) {
    const previous = JSON.parse(readFileSync(marker, "utf8"));
    if (
      previous.directory !== directory ||
      previous.user !== config.user ||
      previous.port !== config.port
    )
      throw new Error("Identificação do banco local diverge.");
  }
  const execute = (command, args) =>
    new Promise((yes, no) => {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: "ignore",
      });
      child.once("error", no);
      child.once("exit", (code) =>
        code === 0
          ? yes()
          : no(new Error("Ferramenta PostgreSQL retornou falha.")),
      );
    });
  if (!existsSync(resolve(directory, "PG_VERSION"))) {
    const passwordFile = resolve(".local/initdb-password");
    writeFileSync(passwordFile, config.password + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    try {
      await execute(initdb, [
        "-D",
        directory,
        "-U",
        config.user,
        "--auth=scram-sha-256",
        "--encoding=UTF8",
        "--locale=C",
        `--pwfile=${passwordFile}`,
      ]);
    } finally {
      unlinkSync(passwordFile);
    }
    writeFileSync(
      marker,
      JSON.stringify({ directory, user: config.user, port: config.port }),
      { flag: "wx" },
    );
  }
  const log = createWriteStream(".local/postgres.log", {
    flags: "a",
    mode: 0o600,
  });
  const child = spawn(
    postgres,
    ["-D", directory, "-h", "127.0.0.1", "-p", String(config.port)],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.once("close", () => log.end());
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await execute(pg_ctl, [
      "stop",
      "-D",
      directory,
      "-m",
      "fast",
      "-w",
      "-t",
      "15",
    ]);
  };
  process.once("SIGINT", () => {
    void stop().catch(() => {
      console.error(
        "Não foi possível confirmar a parada. Use npm run db:portable:stop.",
      );
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void stop().catch(() => {
      console.error(
        "Não foi possível confirmar a parada. Use npm run db:portable:stop.",
      );
      process.exitCode = 1;
    });
  });
  child.once("error", () => {
    console.error("Falha ao iniciar PostgreSQL portátil.");
    process.exitCode = 1;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      const client = new pg.Client({
        connectionString: config.adminUrl,
        connectionTimeoutMillis: 500,
      });
      try {
        await client.connect();
        await client.query("SELECT 1");
        ready = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      } finally {
        await client.end().catch(() => {});
      }
      if (child.exitCode !== null) break;
    }
    if (!ready) throw new Error("PostgreSQL não ficou disponível.");
    await prepareLocalDatabase();
    console.log(
      `PostgreSQL portátil ativo em 127.0.0.1:${config.port}. Ctrl+C encerra sem apagar dados.`,
    );
    await new Promise((resolve) => child.once("exit", resolve));
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error && !/password|postgresql:\/\//i.test(error.message)
      ? error.message
      : "Falha na configuração PostgreSQL local.",
  );
  process.exitCode = 1;
});

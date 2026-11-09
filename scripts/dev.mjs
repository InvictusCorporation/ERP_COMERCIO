import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readLocalConfig } from "./database/local-config.mjs";
import { runtimeEnvironment } from "./runtime-environment.mjs";

try {
  loadEnvFile(".env");
  const local = readLocalConfig();
  process.env.DATABASE_URL = local.appUrl;
  process.env.AUTH_DATABASE_URL = local.authUrl;
  process.env.AUTH_ENCRYPTION_KEY = local.authKey;
  process.env.APP_ORIGIN = local.appOrigin;
  process.env.MAIL_TRANSPORT = local.mailTransport;
  if (local.smtpUrl) process.env.SMTP_URL = local.smtpUrl;
  if (local.mailFrom) process.env.MAIL_FROM = local.mailFrom;
} catch {
  console.error(
    "Configuração local ausente ou inválida. Execute npm run setup:local e confira o banco local.",
  );
  process.exit(1);
}
const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");
for (const project of ["packages/contracts", "apps/api"]) {
  const build = spawnSync(
    process.execPath,
    [compiler, "-p", `${project}/tsconfig.json`],
    { stdio: "inherit", env: runtimeEnvironment(process.env, "web") },
  );
  if (build.status !== 0) process.exit(build.status || 1);
}
// Executar pelo Node evita shell e problemas de espaços no caminho no Windows.
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const args of [
  ["apps/api/dist/main.js"],
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "apps/web",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.WEB_PORT || "3000",
  ],
]) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: runtimeEnvironment(
      process.env,
      args[0] === "apps/api/dist/main.js" ? "api" : "web",
    ),
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

try {
  loadEnvFile(".env");
} catch {
  console.error(
    "Arquivo .env ausente. Execute npm run setup:local antes de iniciar.",
  );
  process.exit(1);
}
const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");
for (const project of ["packages/contracts", "apps/api"]) {
  const build = spawnSync(
    process.execPath,
    [compiler, "-p", `${project}/tsconfig.json`],
    { stdio: "inherit" },
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
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

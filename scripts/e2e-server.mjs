import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { readLocalConfig } from "./database/local-config.mjs";
import { runtimeEnvironment } from "./runtime-environment.mjs";
const require = createRequire(import.meta.url);
const run = randomBytes(8).toString("hex");
const webConfig = JSON.parse(readFileSync("apps/web/tsconfig.json", "utf8"));
webConfig.include = [
  "next-env.d.ts",
  "src/**/*.ts",
  "src/**/*.tsx",
  `.next-e2e/${run}/types/**/*.ts`,
  `.next-e2e/${run}/dev/types/**/*.ts`,
];
writeFileSync(
  "apps/web/.e2e-tsconfig.json",
  JSON.stringify(webConfig, null, 2),
);
for (const port of [3001, 3334])
  await new Promise((yes, no) => {
    const server = net.createServer();
    server.once("error", () =>
      no(new Error("Porta de teste ocupada; nenhum serviço foi alterado.")),
    );
    server.listen(port, "127.0.0.1", () => server.close(yes));
  });
for (const project of ["packages/contracts", "apps/api"]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "-p", project + "/tsconfig.json"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(1);
}
const { authDatabase } = await import("../tests/support/auth-database.mjs");
const fixture = await authDatabase("http://127.0.0.1:3001");
const local = readLocalConfig();
const { encrypt } = await import("../apps/api/dist/modules/identity/crypto.js");
writeFileSync(
  ".local/e2e-fixture.enc",
  encrypt(
    JSON.stringify({
      name: fixture.name,
      adminUrl: fixture.adminUrl,
      authUrl: fixture.authUrl,
      appUrl: fixture.appUrl,
      key: fixture.key,
      tenantA: fixture.tenantA,
      tenantB: fixture.tenantB,
    }),
    local.authKey,
  ),
  { mode: 0o600 },
);
await fixture.admin.end();
const env = {
  ...process.env,
  NODE_ENV: "test",
  FISCAL_PROVIDER: "disabled", FISCAL_FOCUS_HOMOLOG_TOKENS: "{}",
  API_HOST: "127.0.0.1",
  API_PORT: "3334",
  API_INTERNAL_URL: "http://127.0.0.1:3334",
  DATABASE_URL: fixture.appUrl,
  AUTH_DATABASE_URL: fixture.authUrl,
  AUTH_ENCRYPTION_KEY: fixture.key,
  APP_ORIGIN: "http://127.0.0.1:3001",
  MAIL_TRANSPORT: "local",
  INVICTUS_E2E: "1",
  INVICTUS_E2E_RUN: run,
};
const children = [];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
};
for (const [target, args] of [
  ["api", ["apps/api/dist/main.js"]],
  [
    "web",
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "apps/web",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
  ],
]) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: runtimeEnvironment(
      { ...env, ...(target === "web" ? { NODE_ENV: "development" } : {}) },
      target,
    ),
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readConfig } from "./config";
test("processo encerra sem iniciar servidor quando configuração está ausente", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [join(__dirname, "main.js")], {
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL ausente ou inválida/);
  assert.doesNotMatch(result.stderr, /private-test-secret/);
});
const valid = {
  DATABASE_URL:
    "postgresql://test:private-test-secret@127.0.0.1:55432/invictus_test",
};
test("valida configuração e utiliza loopback por padrão", () => {
  const config = readConfig(valid);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3333);
});
test("falha claramente quando o banco não foi configurado", () => {
  assert.throws(() => readConfig({}), /DATABASE_URL ausente ou inválida/);
});
test("rejeita protocolos, credenciais e portas inválidas sem expor segredo", () => {
  for (const DATABASE_URL of [
    "https://test:private-test-secret@host/db",
    "postgresql://host/db",
    "postgresql://u:SUBSTITUA_POR_UMA_SENHA_LOCAL@host/db",
  ]) {
    assert.throws(
      () => readConfig({ DATABASE_URL }),
      (error) =>
        error instanceof Error &&
        !error.message.includes("private-test-secret"),
    );
  }
  for (const API_PORT of ["0", "65536", "3333.5", "abc"])
    assert.throws(
      () => readConfig({ ...valid, API_PORT }),
      /API_PORT inválida/,
    );
});

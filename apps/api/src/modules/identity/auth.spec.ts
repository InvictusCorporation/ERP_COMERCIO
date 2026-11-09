import { test } from "node:test";
import assert from "node:assert/strict";
import { readAuthConfig } from "./auth-config";
import { AuthService } from "./auth.service";
import {
  hashPassword,
  verifyPassword,
  validPassword,
  encrypt,
  decrypt,
  csrfToken,
  equalSecret,
  randomToken,
} from "./crypto";
const base = {
  NODE_ENV: "test",
  AUTH_DATABASE_URL:
    "postgresql://invictus_auth:test-only@127.0.0.1:1/invictus_test",
  AUTH_ENCRYPTION_KEY: "a".repeat(64),
  APP_ORIGIN: "http://127.0.0.1:3001",
  MAIL_TRANSPORT: "local",
};
test("hash de senha Argon2id verifica corretamente e rejeita senhas curtas ou em branco", async () => {
  assert.equal(validPassword("curta"), false);
  assert.equal(validPassword(" ".repeat(14)), false);
  assert.equal(validPassword("x".repeat(129)), false);
  assert.equal(validPassword("🔐".repeat(128)), true);
  assert.equal(validPassword("🔐".repeat(129)), false);
  const password = "Senha apenas para testes 2026!";
  assert.equal(validPassword(password), true);
  const hash = await hashPassword(password);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, password), true);
  assert.equal(await verifyPassword(hash, "Outra senha de teste"), false);
});
test("cifra autenticada protege conteúdo e rejeita adulteração ou outra chave", () => {
  const key = randomToken();
  const data = encrypt("conteúdo fictício protegido", key);
  assert.equal(decrypt(data, key), "conteúdo fictício protegido");
  assert.throws(() => decrypt(data, "b".repeat(64)));
  const parts = data.split(".");
  parts[2] = Buffer.from("alterado").toString("base64url");
  assert.throws(() => decrypt(parts.join("."), key));
});
test("CSRF vincula-se à sessão e comparação rejeita formatos inválidos", () => {
  const a = csrfToken(randomToken(), base.AUTH_ENCRYPTION_KEY),
    b = csrfToken(randomToken(), base.AUTH_ENCRYPTION_KEY);
  assert.equal(equalSecret(a, a), true);
  assert.equal(equalSecret(a, b), false);
  assert.equal(equalSecret(a, "curto"), false);
});
test("produção exige HTTPS, chave válida e SMTP; erros não imprimem valores", () => {
  assert.equal(readAuthConfig(base).mailTransport, "local");
  for (const env of [
    { ...base, NODE_ENV: "production" },
    {
      ...base,
      APP_ORIGIN: "https://erp.example.invalid",
      NODE_ENV: "production",
    },
    { ...base, AUTH_ENCRYPTION_KEY: "private-invalid-key" },
  ])
    assert.throws(
      () => readAuthConfig(env),
      (error) =>
        error instanceof Error &&
        !error.message.includes("private-invalid-key"),
    );
  assert.equal(
    readAuthConfig({
      ...base,
      NODE_ENV: "production",
      APP_ORIGIN: "https://erp.example.invalid",
      MAIL_TRANSPORT: "smtp",
      SMTP_URL: "smtps://smtp.example.invalid:465",
      MAIL_FROM: "acesso@example.invalid",
    }).mailTransport,
    "smtp",
  );
});
test("cookie de produção usa prefixo Host, Secure e HttpOnly sem domínio amplo", async () => {
  const service = new AuthService({
    ...readAuthConfig(base),
    origin: "https://erp.example.invalid",
  });
  try {
    await service.onModuleInit();
    const cookie = service.cookie(randomToken());
    assert.match(cookie, /^__Host-invictus_session=/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; HttpOnly/);
    assert.ok(!cookie.includes("Domain="));
    assert.equal(
      service.tokenFromCookies("invictus_session=invalid"),
      undefined,
    );
  } finally {
    await service.onApplicationShutdown();
  }
});

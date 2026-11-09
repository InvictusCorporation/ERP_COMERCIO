import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import * as argon2 from "argon2";
import * as OTPAuth from "otpauth";
export const randomToken = () => randomBytes(32).toString("hex");
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfToken = (token: string, key: string) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update("csrf:" + token)
    .digest("hex");
export const rateKey = (value: string, key: string) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update("rate:" + value)
    .digest("hex");
export function equalSecret(a: string, b: string) {
  return (
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function validPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    !!password.trim() &&
    Array.from(password).length >= 12 &&
    Array.from(password).length <= 128
  );
}
export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password).catch(() => false);
export function encrypt(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decrypt(value: string, key: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Dados protegidos inválidos.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(data, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
export function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: "Invictus ERP Comercial",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}
export function verifyTotp(secret: string, code: string, lastStep: number) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret, "").validate({ token: code, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 30000) + delta;
  return step > lastStep ? step : null;
}
export const newMfaSecret = () => new OTPAuth.Secret({ size: 20 }).base32;

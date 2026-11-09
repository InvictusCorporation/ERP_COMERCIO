export type AuthConfig = {
  databaseUrl: string;
  encryptionKey: string;
  origin: string;
  mailTransport: "local" | "smtp";
  smtpUrl?: string;
  mailFrom?: string;
};
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  try {
    const db = new URL(env.AUTH_DATABASE_URL || "");
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.username !== "invictus_auth" ||
      !db.hostname ||
      db.pathname.length < 2 ||
      !db.password
    )
      throw new Error();
    if (!/^[a-f0-9]{64}$/.test(env.AUTH_ENCRYPTION_KEY || ""))
      throw new Error();
    const origin = new URL(env.APP_ORIGIN || "");
    if (origin.origin !== env.APP_ORIGIN || origin.username || origin.password)
      throw new Error();
    if (
      origin.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        origin.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
      )
    )
      throw new Error();
    const mailTransport = env.MAIL_TRANSPORT;
    if (
      mailTransport !== "smtp" &&
      !(
        mailTransport === "local" &&
        ["development", "test"].includes(env.NODE_ENV || "")
      )
    )
      throw new Error();
    if (mailTransport === "smtp") {
      const smtp = new URL(env.SMTP_URL || "");
      if (
        !["smtp:", "smtps:"].includes(smtp.protocol) ||
        !smtp.hostname ||
        (smtp.port &&
          (!Number.isInteger(Number(smtp.port)) ||
            Number(smtp.port) < 1 ||
            Number(smtp.port) > 65535)) ||
        !env.MAIL_FROM ||
        !/^\S+@\S+\.\S+$/.test(env.MAIL_FROM)
      )
        throw new Error();
    }
    return {
      databaseUrl: env.AUTH_DATABASE_URL!,
      encryptionKey: env.AUTH_ENCRYPTION_KEY!,
      origin: origin.origin,
      mailTransport,
      smtpUrl: env.SMTP_URL,
      mailFrom: env.MAIL_FROM,
    };
  } catch {
    throw new Error(
      "Configuração de autenticação ausente ou inválida. Confira AUTH_DATABASE_URL, AUTH_ENCRYPTION_KEY, APP_ORIGIN e transporte de e-mail.",
    );
  }
}

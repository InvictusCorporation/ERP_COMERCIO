import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  HttpException,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  AuthSession,
  SessionStage,
  SessionEntry,
} from "@invictus/contracts";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import { OWNER_PERMISSIONS, type Permission } from "@invictus/contracts";
import type { AuthConfig } from "./auth-config";
import { AuthStore } from "./auth-store";
import {
  randomToken,
  hashToken,
  hashPassword,
  verifyPassword,
  csrfToken,
  rateKey,
  encrypt,
  decrypt,
  validPassword,
  verifyTotp,
  newMfaSecret,
  totp,
} from "./crypto";

type Row = {
  id: string;
  user_id: string;
  stage: SessionStage;
  email: string;
  display_name: string;
  mfa_required: boolean;
  mfa_secret_enc: string | null;
  active_tenant_id: string | null;
  expires_at: Date;
};
type RecoveryMessage = { to: string; url: string; kind?: "invitation" };
export type MailDelivery = (message: RecoveryMessage) => Promise<void>;
const denied = () => new UnauthorizedException("E-mail ou senha inválidos.");
export class AuthService implements OnApplicationShutdown {
  private readonly store: AuthStore;
  private readonly dummy: Promise<string>;
  private mailTimer?: NodeJS.Timeout;
  private delivering = false;
  constructor(
    readonly config: AuthConfig,
    private readonly mailDelivery?: MailDelivery,
  ) {
    this.store = new AuthStore(config.databaseUrl);
    this.dummy = hashPassword(randomToken());
  }
  async onModuleInit() {
    await this.dummy;
    if (this.config.mailTransport === "smtp") {
      this.mailTimer = setInterval(() => {
        void this.deliverMail().catch(() => {});
      }, 60000);
      this.mailTimer.unref();
    }
  }
  async onApplicationShutdown() {
    if (this.mailTimer) clearInterval(this.mailTimer);
    await this.store.close();
  }
  async isAvailable() {
    try {
      return await this.store.transaction(async () => true);
    } catch {
      return false;
    }
  }
  cookieName() {
    return this.config.origin.startsWith("https:")
      ? "__Host-invictus_session"
      : "invictus_session";
  }
  cookie(token: string, clear = false) {
    return `${this.cookieName()}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 28800}${this.config.origin.startsWith("https:") ? "; Secure" : ""}`;
  }
  tokenFromCookies(header: string | undefined) {
    const found = (header || "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(this.cookieName() + "="));
    if (found.length !== 1) return undefined;
    const token = found[0]!.slice(this.cookieName().length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  }
  private async event(
    client: PoolClient,
    userId: string | null,
    event: string,
  ) {
    await client.query(
      "INSERT INTO identity.auth_events(user_id,event_type) VALUES($1,$2)",
      [userId, event],
    );
  }
  private async rate(
    scope: string,
    value: string,
    max: number,
    seconds: number,
  ) {
    const attempts = await this.store.transaction(
      async (client) =>
        (
          await client.query(
            `INSERT INTO identity.auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+$2*interval '1 second')
      ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
      expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
            [rateKey(scope + ":" + value, this.config.encryptionKey), seconds],
          )
        ).rows[0].attempts as number,
    );
    if (attempts > max)
      throw new HttpException(
        "Muitas tentativas. Aguarde antes de tentar novamente.",
        429,
      );
  }
  private async limited(
    scope: string,
    email: string,
    ip: string,
    max = 8,
    seconds = 900,
  ) {
    await this.rate(scope + ":ip", ip, 60, 300);
    await this.rate(scope + ":account", email, max, seconds);
  }
  private async lookup(
    client: PoolClient,
    raw: string,
    touch = true,
  ): Promise<Row> {
    if (!/^[a-f0-9]{64}$/.test(raw))
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    const row = (
      await client.query(
        `SELECT s.id,s.user_id,s.active_tenant_id,s.expires_at,u.email,u.display_name,c.mfa_required,c.mfa_secret_enc,
      CASE WHEN s.stage='authenticated' AND c.mfa_required AND c.mfa_secret_enc IS NULL THEN 'mfa_setup'
        WHEN s.stage='authenticated' AND c.mfa_secret_enc IS NOT NULL AND (s.mfa_verified_at IS NULL OR s.mfa_verified_at<c.mfa_enabled_at) THEN 'mfa_challenge'
        ELSE s.stage END AS stage
      FROM identity.sessions s JOIN identity.users u ON u.id=s.user_id JOIN identity.credentials c ON c.user_id=u.id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND u.active`,
        [hashToken(raw)],
      )
    ).rows[0] as Row | undefined;
    if (!row)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    if (touch)
      await client.query(
        "UPDATE identity.sessions SET last_seen_at=now() WHERE id=$1",
        [row.id],
      );
    return row;
  }
  private full(row: Row) {
    if (row.stage !== "authenticated")
      throw new ForbiddenException("Conclua a autenticação em duas etapas.");
  }
  async accessPermissions(
    client: PoolClient,
    userId: string,
    tenantId: string,
  ): Promise<Permission[]> {
    await client.query(
      "SELECT set_config('app.auth_user_id',$1,true),set_config('app.auth_tenant_id',$2,true)",
      [userId, tenantId],
    );
    const member = (
      await client.query(
        `SELECT m.is_owner,r.permissions FROM identity.memberships m JOIN tenancy.tenants t ON t.id=m.tenant_id LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.user_id=$1 AND m.tenant_id=$2 AND m.active AND t.active`,
        [userId, tenantId],
      )
    ).rows[0];
    return member?.is_owner
      ? [...OWNER_PERMISSIONS]
      : member?.permissions || [];
  }
  async withAccess<T>(
    raw: string,
    action: (
      client: PoolClient,
      context: { userId: string; tenantId: string; permissions: Permission[] },
    ) => Promise<T>,
  ): Promise<T> {
    return this.store.transaction(async (client) => {
      const initial = await this.lookup(client, raw, false);
      this.full(initial);
      const tenants = await this.tenants(client, initial.user_id);
      const tenant =
        tenants.find((t) => t.id === initial.active_tenant_id) ||
        (tenants.length === 1 ? tenants[0] : undefined);
      if (!tenant)
        throw new ForbiddenException(
          "Selecione uma empresa com vínculo ativo.",
        );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [tenant.id],
      );
      const row = await this.lookup(client, raw, false);
      this.full(row);
      const permissions = await this.accessPermissions(
        client,
        row.user_id,
        tenant.id,
      );
      const member = (
        await client.query(
          "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2 AND active",
          [tenant.id, row.user_id],
        )
      ).rows[0];
      if (!member)
        throw new ForbiddenException("Vínculo suspenso nesta empresa.");
      const result = await action(client, {
        userId: row.user_id,
        tenantId: tenant.id,
        permissions,
      });
      await client.query(
        "UPDATE identity.sessions SET last_seen_at=now() WHERE id=$1",
        [row.id],
      );
      return result;
    });
  }
  async identityTransaction<T>(action: (client: PoolClient) => Promise<T>) {
    return this.store.transaction(action);
  }
  async limitInvitation(ip: string) {
    await this.rate("invitation:ip", ip, 30, 300);
  }
  private async tenants(client: PoolClient, userId: string) {
    await client.query("SELECT set_config('app.auth_user_id',$1,true)", [
      userId,
    ]);
    return (
      await client.query(
        `SELECT t.id,t.name,m.is_owner AS "isOwner" FROM tenancy.tenants t JOIN identity.memberships m ON m.tenant_id=t.id WHERE m.user_id=$1 AND m.active AND t.active ORDER BY t.name`,
        [userId],
      )
    ).rows as AuthSession["tenants"];
  }
  async session(raw: string): Promise<AuthSession> {
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw, false);
      const tenants =
        row.stage === "authenticated"
          ? await this.tenants(client, row.user_id)
          : [];
      const selected = tenants.some((t) => t.id === row.active_tenant_id)
        ? row.active_tenant_id
        : tenants.length === 1
          ? tenants[0]!.id
          : null;
      if (selected !== row.active_tenant_id)
        await client.query(
          "UPDATE identity.sessions SET active_tenant_id=$1 WHERE id=$2",
          [selected, row.id],
        );
      return {
        id: row.id,
        stage: row.stage,
        csrf: csrfToken(raw, this.config.encryptionKey),
        expiresAt: row.expires_at.toISOString(),
        user: {
          id: row.user_id,
          name: row.display_name,
          email: row.email,
          mfaEnabled: !!row.mfa_secret_enc,
          mfaRequired: row.mfa_required,
        },
        tenants,
        activeTenantId: selected,
        permissions: selected
          ? await this.accessPermissions(client, row.user_id, selected)
          : [],
      };
    });
  }
  async login(
    email: string,
    password: string,
    ip: string,
    agent: string,
    oldToken?: string,
  ) {
    await this.limited("login", email, ip);
    const raw = randomToken();
    const result = await this.store.transaction(async (client) => {
      const account = (
        await client.query(
          `SELECT u.id,u.active,c.password_hash,c.mfa_required,c.mfa_secret_enc FROM identity.users u JOIN identity.credentials c ON c.user_id=u.id WHERE u.email=$1 FOR UPDATE OF c`,
          [email],
        )
      ).rows[0];
      const valid = await verifyPassword(
        account?.password_hash || (await this.dummy),
        password,
      );
      if (!account || !account.active || !valid) {
        await this.event(client, account?.id || null, "login_failed");
        return null;
      }
      const stage: SessionStage = account.mfa_secret_enc
        ? "mfa_challenge"
        : account.mfa_required
          ? "mfa_setup"
          : "authenticated";
      if (oldToken && /^[a-f0-9]{64}$/.test(oldToken))
        await client.query(
          "UPDATE identity.sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",
          [hashToken(oldToken)],
        );
      await client.query(
        `INSERT INTO identity.sessions(user_id,token_hash,stage,user_agent,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 second')`,
        [
          account.id,
          hashToken(raw),
          stage,
          agent.slice(0, 220),
          stage === "authenticated" ? 28800 : 300,
        ],
      );
      await client.query(
        `UPDATE identity.sessions SET revoked_at=now() WHERE id IN (SELECT id FROM identity.sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC,id DESC OFFSET 10)`,
        [account.id],
      );
      await this.event(client, account.id, "login_succeeded");
      return stage;
    });
    if (!result) throw denied();
    return { token: raw, stage: result };
  }
  async logout(raw: string) {
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw);
      await client.query(
        "UPDATE identity.sessions SET revoked_at=now() WHERE id=$1",
        [row.id],
      );
      await this.event(client, row.user_id, "logout");
    });
  }
  async sessions(raw: string): Promise<SessionEntry[]> {
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw);
      this.full(row);
      return (
        await client.query(
          `SELECT id,created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",user_agent AS "userAgent",(id=$2) AS current FROM identity.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 50`,
          [row.user_id, row.id],
        )
      ).rows;
    });
  }
  async revoke(raw: string, id?: string) {
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw);
      this.full(row);
      if (id)
        await client.query(
          "UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND id=$2",
          [row.user_id, id],
        );
      else
        await client.query(
          "UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1",
          [row.user_id],
        );
      await this.event(client, row.user_id, "sessions_revoked");
      return !id || id === row.id;
    });
  }
  async selectTenant(raw: string, tenantId: string) {
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw);
      this.full(row);
      if (
        !(await this.tenants(client, row.user_id)).some(
          (t) => t.id === tenantId,
        )
      )
        throw new ForbiddenException("Empresa não autorizada.");
      await client.query(
        "UPDATE identity.sessions SET active_tenant_id=$1 WHERE id=$2",
        [tenantId, row.id],
      );
    });
  }
  async enroll(raw: string, password?: string) {
    await this.rate("mfa-enroll:session", hashToken(raw), 5, 900);
    return this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw, false);
      const credential = (
        await client.query(
          "SELECT * FROM identity.credentials WHERE user_id=$1 FOR UPDATE",
          [row.user_id],
        )
      ).rows[0];
      if (credential.mfa_secret_enc || row.stage === "mfa_challenge")
        throw new ForbiddenException(
          "Autenticação em duas etapas já configurada.",
        );
      if (
        row.stage === "authenticated" &&
        (!password ||
          !(await verifyPassword(credential.password_hash, password)))
      )
        throw denied();
      const secret = newMfaSecret();
      await client.query(
        "UPDATE identity.credentials SET mfa_pending_enc=$1,mfa_pending_until=now()+interval '10 minutes' WHERE user_id=$2",
        [encrypt(secret, this.config.encryptionKey), row.user_id],
      );
      const uri = totp(secret, row.email).toString();
      return {
        qr: await QRCode.toDataURL(uri, { width: 240, margin: 2 }),
        secret,
      };
    });
  }
  async verifyMfa(raw: string, code: string, ip: string) {
    await this.rate("mfa:ip", ip, 60, 300);
    await this.rate("mfa:session", hashToken(raw), 8, 300);
    const token = randomToken();
    await this.store.transaction(async (client) => {
      const row = await this.lookup(client, raw, false);
      const credential = (
        await client.query(
          "SELECT * FROM identity.credentials WHERE user_id=$1 FOR UPDATE",
          [row.user_id],
        )
      ).rows[0];
      const enrolling = !credential.mfa_secret_enc;
      const encoded = enrolling
        ? credential.mfa_pending_enc
        : credential.mfa_secret_enc;
      if (
        !encoded ||
        (enrolling &&
          (!credential.mfa_pending_until ||
            new Date(credential.mfa_pending_until).getTime() <= Date.now()))
      )
        throw new BadRequestException(
          "Configuração expirada. Gere um novo QR Code.",
        );
      const step = verifyTotp(
        decrypt(encoded, this.config.encryptionKey),
        code,
        Number(credential.mfa_last_step),
      );
      if (step === null)
        throw new BadRequestException(
          "Código inválido ou já utilizado. Aguarde um novo código.",
        );
      await client.query(
        "UPDATE identity.credentials SET mfa_secret_enc=$1,mfa_enabled_at=coalesce(mfa_enabled_at,now()),mfa_last_step=$2,mfa_pending_enc=NULL,mfa_pending_until=NULL WHERE user_id=$3",
        [encoded, step, row.user_id],
      );
      if (enrolling)
        await client.query(
          "UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",
          [row.user_id, row.id],
        );
      const changed = await client.query(
        `UPDATE identity.sessions SET token_hash=$1,stage='authenticated',mfa_verified_at=now(),expires_at=now()+interval '8 hours',last_seen_at=now() WHERE id=$2 AND token_hash=$3 AND revoked_at IS NULL`,
        [hashToken(token), row.id, hashToken(raw)],
      );
      if (changed.rowCount !== 1)
        throw new UnauthorizedException("Sessão substituída. Entre novamente.");
      await this.event(
        client,
        row.user_id,
        enrolling ? "mfa_enabled" : "mfa_verified",
      );
    });
    return token;
  }
  async forgot(email: string, ip: string) {
    const started = Date.now();
    await this.limited("recovery", email, ip, 3, 3600);
    const token = randomToken();
    await this.store.transaction(async (client) => {
      const user = (
        await client.query(
          "SELECT u.id FROM identity.users u JOIN identity.credentials c ON c.user_id=u.id WHERE u.email=$1 AND u.active FOR UPDATE OF c",
          [email],
        )
      ).rows[0];
      if (!user) return;
      await client.query(
        "UPDATE identity.recovery_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [user.id],
      );
      await client.query(
        "INSERT INTO identity.recovery_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
        [user.id, hashToken(token)],
      );
      const message: RecoveryMessage = {
        to: email,
        url: this.config.origin + "/redefinir-senha#token=" + token,
      };
      await client.query(
        "INSERT INTO identity.mail_outbox(user_id,payload_enc) VALUES($1,$2)",
        [user.id, encrypt(JSON.stringify(message), this.config.encryptionKey)],
      );
      await this.event(client, user.id, "password_reset_requested");
    });
    if (this.mailDelivery || this.config.mailTransport === "smtp")
      void this.deliverMail().catch(() => {});
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))),
    );
  }
  async reset(token: string, password: string, code: string, ip: string) {
    if (!validPassword(password) || !password.trim())
      throw new BadRequestException("Use uma senha com 12 a 128 caracteres.");
    await this.rate("reset:ip", ip, 30, 300);
    const done = await this.store.transaction(async (client) => {
      const initial = (
        await client.query(
          "SELECT user_id FROM identity.recovery_tokens WHERE token_hash=$1",
          [hashToken(token)],
        )
      ).rows[0];
      if (!initial) return false;
      const credential = (
        await client.query(
          "SELECT c.*,u.active FROM identity.credentials c JOIN identity.users u ON u.id=c.user_id WHERE c.user_id=$1 FOR UPDATE OF c",
          [initial.user_id],
        )
      ).rows[0];
      const recovery = (
        await client.query(
          "SELECT id FROM identity.recovery_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
          [hashToken(token)],
        )
      ).rows[0];
      if (!credential?.active || !recovery) return false;
      let step = Number(credential.mfa_last_step);
      if (credential.mfa_secret_enc) {
        const checked = verifyTotp(
          decrypt(credential.mfa_secret_enc, this.config.encryptionKey),
          code,
          step,
        );
        if (checked === null) return false;
        step = checked;
      }
      const passwordHash = await hashPassword(password);
      await client.query(
        "UPDATE identity.credentials SET password_hash=$1,password_changed_at=now(),mfa_last_step=$2,mfa_pending_enc=NULL,mfa_pending_until=NULL WHERE user_id=$3",
        [passwordHash, step, initial.user_id],
      );
      await client.query(
        "UPDATE identity.recovery_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [initial.user_id],
      );
      await client.query(
        "UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [initial.user_id],
      );
      await this.event(client, initial.user_id, "password_reset_completed");
      return true;
    });
    if (!done)
      throw new BadRequestException(
        "Link expirado, já utilizado ou código de autenticação inválido.",
      );
  }
  async deliverMail() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      await this.store.transaction(async (client) => {
        const rows = (
          await client.query(
            "SELECT id,payload_enc FROM identity.mail_outbox WHERE delivered_at IS NULL AND attempts<10 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10",
          )
        ).rows;
        const smtp =
          this.config.mailTransport === "smtp"
            ? new URL(this.config.smtpUrl!)
            : null;
        const transport = smtp
          ? nodemailer.createTransport({
              host: smtp.hostname,
              port: Number(
                smtp.port || (smtp.protocol === "smtps:" ? 465 : 587),
              ),
              secure: smtp.protocol === "smtps:",
              requireTLS: true,
              auth: smtp.username
                ? {
                    user: decodeURIComponent(smtp.username),
                    pass: decodeURIComponent(smtp.password),
                  }
                : undefined,
              connectionTimeout: 4000,
              greetingTimeout: 4000,
              socketTimeout: 4000,
              logger: false,
              debug: false,
              disableFileAccess: true,
              disableUrlAccess: true,
            })
          : null;
        try {
          for (const row of rows) {
            await client.query(
              "UPDATE identity.mail_outbox SET attempts=attempts+1 WHERE id=$1",
              [row.id],
            );
            try {
              const message = JSON.parse(
                decrypt(row.payload_enc, this.config.encryptionKey),
              ) as RecoveryMessage;
              if (this.mailDelivery) await this.mailDelivery(message);
              else if (transport)
                await transport.sendMail({
                  from: this.config.mailFrom,
                  to: message.to,
                  subject:
                    message.kind === "invitation"
                      ? "Convite para a equipe — Invictus ERP"
                      : "Recupere seu acesso — Invictus ERP",
                  text:
                    message.kind === "invitation"
                      ? `Você recebeu um convite para uma empresa no Invictus ERP. Confira a empresa e o perfil antes de aceitar. Link válido por 7 dias: ${message.url}`
                      : `Use este link em até 30 minutos para redefinir sua senha: ${message.url}\nSe você não solicitou, ignore esta mensagem.`,
                  disableFileAccess: true,
                  disableUrlAccess: true,
                });
              else continue;
              await client.query(
                "UPDATE identity.mail_outbox SET delivered_at=now() WHERE id=$1",
                [row.id],
              );
            } catch {
              /* A fila mantém conteúdo cifrado para nova tentativa. Nunca imprimir payload ou token. */
            }
          }
        } finally {
          transport?.close();
        }
      });
    } finally {
      this.delivering = false;
    }
  }
}

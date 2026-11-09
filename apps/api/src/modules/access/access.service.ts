import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  OWNER_PERMISSIONS,
  type Permission,
  type AccessOverview,
  type AccessRole,
  type InvitePreview,
} from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
import {
  hashToken,
  randomToken,
  encrypt,
  hashPassword,
  validPassword,
} from "../identity/crypto";
import { availableUnits, validateScope } from "../organizations/unit-scope";
import type { UnitScope } from "@invictus/contracts";
type Context = {
  userId: string;
  tenantId: string;
  permissions: Permission[];
};
const systemRoles: [string, Permission[]][] = [
  ["Proprietário", []],
  [
    "Administrador",
    [
      "users.read",
      "users.manage",
      "roles.manage",
      "organizations.read",
      "organizations.manage",
      "audit.read",
      "products.read",
      "products.manage",
      "stock.read",
      "stock.manage",
      "suppliers.read",
      "suppliers.manage",
      "purchases.read",
      "purchases.manage",
      "purchases.approve",
      "purchases.receive",
    ],
  ],
  ["Gerente", ["users.read", "organizations.read"]],
  ["Financeiro", ["organizations.read"]],
  ["Comprador", ["organizations.read"]],
  ["Estoquista", ["organizations.read"]],
  ["Operador de caixa", ["organizations.read"]],
  ["Vendedor", ["organizations.read"]],
  ["Conferente", ["organizations.read"]],
  ["Entregador", ["organizations.read"]],
];
const missing = () =>
  new NotFoundException("Registro não encontrado nesta empresa.");
const sensitive = (p: Permission[]) =>
  p.includes("users.manage") ||
  p.includes("roles.manage") ||
  p.includes("organizations.manage") ||
  p.includes("audit.read") ||
  p.includes("products.manage") ||
  p.includes("stock.manage") ||
  p.includes("suppliers.manage") ||
  p.includes("purchases.manage") ||
  p.includes("purchases.approve") ||
  p.includes("purchases.receive");
export class AccessService {
  constructor(private readonly auth: AuthService) {}
  private require(ctx: Context, p: Permission) {
    if (!ctx.permissions.includes(p))
      throw new ForbiddenException("Você não tem permissão para esta ação.");
  }
  private async roles(c: PoolClient, tenant: string): Promise<AccessRole[]> {
    for (const [name, permissions] of systemRoles)
      await c.query(
        "INSERT INTO access.roles(tenant_id,name,system,permissions) VALUES($1,$2,true,$3) ON CONFLICT(tenant_id,name) DO NOTHING",
        [tenant, name, permissions],
      );
    return (
      await c.query(
        "SELECT id,name,system,permissions FROM access.roles WHERE tenant_id=$1 ORDER BY system DESC,name",
        [tenant],
      )
    ).rows.map((r) => ({
      ...r,
      permissions:
        r.system && r.name === "Proprietário"
          ? [...OWNER_PERMISSIONS]
          : r.permissions,
      sensitive:
        (r.system && r.name === "Proprietário") || sensitive(r.permissions),
    }));
  }
  private async event(c: PoolClient, ctx: Context, action: string, id: string) {
    await c.query(
      "INSERT INTO access.events(tenant_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
      [ctx.tenantId, ctx.userId, action, id],
    );
  }
  private grant(ctx: Context, role: AccessRole) {
    if (role.permissions.some((p) => !ctx.permissions.includes(p)))
      throw new ForbiddenException(
        "Este perfil contém permissões que você não pode conceder.",
      );
  }
  async overview(raw: string): Promise<AccessOverview> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "users.read");
      const roles = await this.roles(c, ctx.tenantId);
      const tenant = (
        await c.query("SELECT id,name FROM tenancy.tenants WHERE id=$1", [
          ctx.tenantId,
        ])
      ).rows[0];
      const members = (
        await c.query(
          `SELECT m.id,u.display_name AS name,u.email,(m.active AND u.active) AS active,m.is_owner AS "isOwner",m.all_units AS "allUnits",ARRAY(SELECT a.unit_id FROM organizations.membership_units a WHERE a.tenant_id=m.tenant_id AND a.membership_id=m.id ORDER BY a.unit_id) AS "unitIds",m.role_id AS "roleId",r.name AS "roleName",(cr.mfa_secret_enc IS NOT NULL) AS "mfaEnabled" FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id JOIN identity.credentials cr ON cr.user_id=u.id WHERE m.tenant_id=$1 ORDER BY m.is_owner DESC,u.display_name`,
          [ctx.tenantId],
        )
      ).rows.map((m) => ({
        ...m,
        roleId: m.isOwner
          ? roles.find((r) => r.name === "Proprietário" && r.system)!.id
          : m.roleId ||
            roles.find((r) => r.name === "Operador de caixa" && r.system)!.id,
        roleName: m.isOwner
          ? "Proprietário"
          : m.roleName || "Operador de caixa",
      }));
      const invitations = ctx.permissions.includes("users.manage")
        ? (
            await c.query(
              `SELECT i.id,i.all_units AS "allUnits",ARRAY(SELECT a.unit_id FROM organizations.invitation_units a WHERE a.tenant_id=i.tenant_id AND a.invitation_id=i.id ORDER BY a.unit_id) AS "unitIds",i.display_name AS name,i.email,CASE WHEN i.is_owner THEN 'Proprietário' ELSE r.name END AS "roleName",i.expires_at AS "expiresAt",CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted' WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.expires_at<=now() THEN 'expired' ELSE 'pending' END AS status FROM access.invitations i JOIN access.roles r ON r.tenant_id=i.tenant_id AND r.id=i.role_id WHERE i.tenant_id=$1 ORDER BY i.created_at DESC LIMIT 100`,
              [ctx.tenantId],
            )
          ).rows
        : [];
      return {
        tenant,
        actorId: ctx.userId,
        permissions: ctx.permissions,
        roles,
        members,
        invitations,
        units: await availableUnits(c, ctx.userId, ctx.tenantId),
      };
    });
  }
  async invite(
    raw: string,
    input: {
      email: string;
      name: string;
      roleId: string;
      scope?: UnitScope;
    },
  ) {
    await this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "users.manage");
      const roles = await this.roles(c, ctx.tenantId);
      const role = roles.find((r) => r.id === input.roleId);
      if (!role) throw missing();
      this.grant(ctx, role);
      const scope = await validateScope(
        c,
        ctx.tenantId,
        input.scope || { allUnits: true, unitIds: [] },
        role.system && role.name === "Proprietário",
      );
      if (
        (
          await c.query(
            "SELECT m.id FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND u.email=$2",
            [ctx.tenantId, input.email],
          )
        ).rowCount
      )
        throw new ConflictException(
          "Esta pessoa já possui vínculo. Edite o cadastro existente.",
        );
      await c.query(
        "UPDATE access.invitations SET revoked_at=now() WHERE tenant_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
        [ctx.tenantId, input.email],
      );
      const token = randomToken();
      const row = (
        await c.query(
          "INSERT INTO access.invitations(tenant_id,email,display_name,role_id,is_owner,token_hash,invited_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [
            ctx.tenantId,
            input.email,
            input.name,
            role.id,
            role.system && role.name === "Proprietário",
            hashToken(token),
            ctx.userId,
          ],
        )
      ).rows[0];
      await c.query(
        "UPDATE access.invitations SET all_units=$1 WHERE tenant_id=$2 AND id=$3",
        [scope.allUnits, ctx.tenantId, row.id],
      );
      for (const unitId of scope.unitIds)
        await c.query(
          "INSERT INTO organizations.invitation_units(tenant_id,invitation_id,unit_id) VALUES($1,$2,$3)",
          [ctx.tenantId, row.id, unitId],
        );
      const payload = {
        to: input.email,
        kind: "invitation",
        url: this.auth.config.origin + "/aceitar-convite#token=" + token,
      };
      await c.query(
        "INSERT INTO identity.mail_outbox(recipient,payload_enc) VALUES($1,$2)",
        [
          input.email,
          encrypt(JSON.stringify(payload), this.auth.config.encryptionKey),
        ],
      );
      await this.event(c, ctx, "invite.created", row.id);
    });
    if (this.auth.config.mailTransport === "smtp")
      void this.auth.deliverMail().catch(() => {});
    return { ok: true };
  }
  async revokeInvite(raw: string, id: string) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "users.manage");
      const i = (
        await c.query(
          "SELECT role_id,is_owner FROM access.invitations WHERE tenant_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
          [ctx.tenantId, id],
        )
      ).rows[0];
      if (!i) throw missing();
      const role = (await this.roles(c, ctx.tenantId)).find(
        (r) => r.id === i.role_id,
      )!;
      this.grant(ctx, role);
      await c.query(
        "UPDATE access.invitations SET revoked_at=now() WHERE tenant_id=$1 AND id=$2",
        [ctx.tenantId, id],
      );
      await this.event(c, ctx, "invite.revoked", id);
      return { ok: true };
    });
  }
  async changeMember(
    raw: string,
    id: string,
    roleId: string,
    active: boolean,
    scopeInput?: UnitScope,
  ) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "users.manage");
      const roles = await this.roles(c, ctx.tenantId);
      const role = roles.find((r) => r.id === roleId);
      if (!role) throw missing();
      this.grant(ctx, role);
      const member = (
        await c.query(
          "SELECT m.*,u.active AS user_active FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.id=$2 FOR UPDATE OF m",
          [ctx.tenantId, id],
        )
      ).rows[0];
      if (!member) throw missing();
      if (member.is_owner) this.require(ctx, "ownership.manage");
      else if (member.role_id) {
        const old = roles.find((r) => r.id === member.role_id);
        if (old) this.grant(ctx, old);
      }
      const owner = role.system && role.name === "Proprietário";
      const previousUnits = (
        await c.query(
          "SELECT unit_id FROM organizations.membership_units WHERE tenant_id=$1 AND membership_id=$2",
          [ctx.tenantId, id],
        )
      ).rows.map((r) => r.unit_id);
      const scope = scopeInput
        ? await validateScope(c, ctx.tenantId, scopeInput, owner)
        : { allUnits: member.all_units, unitIds: previousUnits };
      if (owner && !scope.allUnits)
        throw new BadRequestException(
          "Proprietário deve ter acesso a todas as unidades.",
        );
      if (member.is_owner && member.active && (!active || !owner)) {
        const owners = (
          await c.query(
            "SELECT count(*) AS n FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.is_owner AND m.active AND u.active",
            [ctx.tenantId],
          )
        ).rows[0];
        if (Number(owners.n) <= 1)
          throw new ConflictException(
            "A empresa precisa manter pelo menos um proprietário ativo.",
          );
      }
      if (active && !member.user_active)
        throw new ConflictException(
          "Esta conta está inativa. O vínculo não pode ser reativado.",
        );
      await c.query(
        "UPDATE identity.memberships SET role_id=$1,is_owner=$2,active=$3,all_units=$6 WHERE tenant_id=$4 AND id=$5",
        [role.id, owner, active, ctx.tenantId, id, scope.allUnits],
      );
      if (scopeInput) {
        await c.query(
          "DELETE FROM organizations.membership_units WHERE tenant_id=$1 AND membership_id=$2 AND NOT(unit_id=ANY($3::uuid[]))",
          [ctx.tenantId, id, scope.unitIds],
        );
        for (const unitId of scope.unitIds)
          await c.query(
            "INSERT INTO organizations.membership_units(tenant_id,membership_id,unit_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [ctx.tenantId, id, unitId],
          );
      }
      if (owner || sensitive(role.permissions))
        await c.query(
          "UPDATE identity.credentials SET mfa_required=true WHERE user_id=$1",
          [member.user_id],
        );
      await this.event(c, ctx, "member.changed", id);
      return { ok: true };
    });
  }
  async saveRole(
    raw: string,
    id: string | undefined,
    name: string,
    permissions: Permission[],
  ) {
    permissions = [...new Set(permissions)].sort();
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "roles.manage");
      if (
        permissions.includes("ownership.manage") ||
        permissions.some((p) => !ctx.permissions.includes(p))
      )
        throw new ForbiddenException(
          "Permissões não autorizadas para este perfil.",
        );
      await this.roles(c, ctx.tenantId);
      if (
        (permissions.includes("suppliers.manage") &&
          !permissions.includes("suppliers.read")) ||
        (permissions.includes("purchases.read") &&
          (!permissions.includes("suppliers.read") ||
            !permissions.includes("products.read"))) ||
        (permissions.some((p) =>
          [
            "purchases.manage",
            "purchases.approve",
            "purchases.receive",
          ].includes(p),
        ) &&
          !permissions.includes("purchases.read")) ||
        (permissions.includes("purchases.receive") &&
          !permissions.includes("stock.manage"))
      )
        throw new BadRequestException(
          "Inclua as consultas de fornecedores, produtos e compras e, para recebimento, a movimentação de estoque.",
        );
      if (
        (permissions.includes("products.manage") &&
          !permissions.includes("products.read")) ||
        (permissions.includes("stock.read") &&
          !permissions.includes("products.read")) ||
        (permissions.includes("stock.manage") &&
          (!permissions.includes("stock.read") ||
            !permissions.includes("products.read")))
      )
        throw new BadRequestException(
          "Inclua as permissões de consulta de produtos e estoque necessárias à ação.",
        );
      if (
        permissions.includes("organizations.manage") &&
        !permissions.includes("organizations.read")
      )
        throw new BadRequestException(
          "Inclua a consulta de empresas para conceder sua administração.",
        );
      if (
        (permissions.includes("users.manage") ||
          permissions.includes("roles.manage")) &&
        !permissions.includes("users.read")
      )
        throw new BadRequestException(
          "Inclua a consulta de usuários para conceder administração.",
        );
      if (id) {
        const old = (
          await c.query(
            "SELECT system,permissions FROM access.roles WHERE tenant_id=$1 AND id=$2",
            [ctx.tenantId, id],
          )
        ).rows[0];
        if (!old) throw missing();
        if (old.system)
          throw new ForbiddenException(
            "Perfis padrão são protegidos. Crie um perfil personalizado.",
          );
        this.grant(ctx, {
          ...old,
          id,
          name,
          sensitive: sensitive(old.permissions),
        });
        if (
          old.permissions.length === permissions.length &&
          old.permissions.every((p: Permission) => permissions.includes(p))
        )
          permissions = old.permissions;
      }
      const duplicate = (
        await c.query(
          "SELECT id FROM access.roles WHERE tenant_id=$1 AND lower(name)=lower($2) AND ($3::uuid IS NULL OR id<>$3)",
          [ctx.tenantId, name, id || null],
        )
      ).rowCount;
      if (duplicate)
        throw new ConflictException("Já existe um perfil com esse nome.");
      const saved = id
        ? (
            await c.query(
              "UPDATE access.roles SET name=$1,permissions=$2 WHERE tenant_id=$3 AND id=$4 RETURNING id",
              [name, permissions, ctx.tenantId, id],
            )
          ).rows[0]
        : (
            await c.query(
              "INSERT INTO access.roles(tenant_id,name,permissions) VALUES($1,$2,$3) RETURNING id",
              [ctx.tenantId, name, permissions],
            )
          ).rows[0];
      if (sensitive(permissions))
        await c.query(
          "UPDATE identity.credentials SET mfa_required=true WHERE user_id IN (SELECT user_id FROM identity.memberships WHERE tenant_id=$1 AND role_id=$2)",
          [ctx.tenantId, saved.id],
        );
      await this.event(c, ctx, id ? "role.changed" : "role.created", saved.id);
      return { ok: true };
    });
  }
  private async invitation(c: PoolClient, token: string) {
    await c.query("SELECT set_config('app.invitation_hash',$1,true)", [
      hashToken(token),
    ]);
    const initial = (
      await c.query(
        "SELECT tenant_id FROM access.invitations WHERE token_hash=$1",
        [hashToken(token)],
      )
    ).rows[0];
    if (!initial)
      throw new BadRequestException(
        "Convite inválido, expirado ou indisponível.",
      );
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      initial.tenant_id,
    ]);
    await c.query("SELECT set_config('app.auth_tenant_id',$1,true)", [
      initial.tenant_id,
    ]);
    const invitation = (
      await c.query(
        `SELECT i.*,r.permissions,r.name AS role_name,t.name AS company,t.active AS tenant_active FROM access.invitations i JOIN access.roles r ON r.tenant_id=i.tenant_id AND r.id=i.role_id JOIN tenancy.tenants t ON t.id=i.tenant_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() FOR UPDATE OF i`,
        [hashToken(token)],
      )
    ).rows[0];
    if (!invitation?.tenant_active)
      throw new BadRequestException(
        "Convite inválido, expirado ou indisponível.",
      );
    const inviter = (
      await c.query(
        "SELECT m.is_owner,m.all_units,m.active,u.active AS user_active,r.permissions FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=$1 AND m.user_id=$2",
        [invitation.tenant_id, invitation.invited_by],
      )
    ).rows[0];
    const allowed: Permission[] = inviter?.is_owner
      ? [...OWNER_PERMISSIONS]
      : inviter?.permissions || [];
    const requested: Permission[] = invitation.is_owner
      ? [...OWNER_PERMISSIONS]
      : invitation.permissions;
    if (
      !inviter?.active ||
      (!inviter.is_owner && !inviter.all_units) ||
      !inviter.user_active ||
      !allowed.includes("users.manage") ||
      requested.some((p) => !allowed.includes(p))
    )
      throw new BadRequestException(
        "Convite inválido, expirado ou indisponível.",
      );
    const unitIds = (
      await c.query(
        "SELECT unit_id FROM organizations.invitation_units WHERE tenant_id=$1 AND invitation_id=$2",
        [invitation.tenant_id, invitation.id],
      )
    ).rows.map((r) => r.unit_id);
    await validateScope(
      c,
      invitation.tenant_id,
      { allUnits: invitation.all_units, unitIds },
      invitation.is_owner,
    );
    return { ...invitation, unit_ids: unitIds };
  }
  async preview(token: string, ip: string): Promise<InvitePreview> {
    await this.auth.limitInvitation(ip);
    return this.auth.identityTransaction(async (c) => {
      const i = await this.invitation(c, token);
      const exists = !!(
        await c.query("SELECT id FROM identity.users WHERE email=$1", [i.email])
      ).rowCount;
      return {
        email: i.email,
        name: i.display_name,
        company: i.company,
        role: i.is_owner ? "Proprietário" : i.role_name,
        existingAccount: exists,
      };
    });
  }
  async accept(
    token: string,
    password: string | undefined,
    raw: string | undefined,
    ip: string,
  ) {
    await this.auth.limitInvitation(ip);
    const session = raw ? await this.auth.session(raw) : undefined;
    if (session && session.stage !== "authenticated")
      throw new ForbiddenException(
        "Conclua a autenticação em duas etapas antes de aceitar.",
      );
    return this.auth.identityTransaction(async (c) => {
      const i = await this.invitation(c, token);
      let user = (
        await c.query("SELECT id,active FROM identity.users WHERE email=$1", [
          i.email,
        ])
      ).rows[0];
      if (user) {
        if (!session || session.user.id !== user.id || !user.active)
          throw new ForbiddenException(
            "Entre com a conta convidada para aceitar este convite.",
          );
        // Revalidar no mesmo banco: sessão não pode ser substituída/revogada entre consulta e aceite.
        if (
          !(
            await c.query(
              "SELECT s.id FROM identity.sessions s JOIN identity.credentials cr ON cr.user_id=s.user_id JOIN identity.users u ON u.id=s.user_id WHERE s.id=$1 AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.stage='authenticated' AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND u.active AND (NOT cr.mfa_required OR cr.mfa_secret_enc IS NOT NULL) AND (cr.mfa_secret_enc IS NULL OR s.mfa_verified_at>=cr.mfa_enabled_at)",
              [session.id, hashToken(raw!)],
            )
          ).rowCount
        )
          throw new ForbiddenException("Entre novamente para aceitar.");
      } else {
        if (session)
          throw new ForbiddenException(
            "Saia da conta atual antes de cadastrar o novo acesso.",
          );
        if (!password || !validPassword(password))
          throw new BadRequestException(
            "Use uma senha com 12 a 128 caracteres.",
          );
        const hash = await hashPassword(password);
        user = (
          await c.query(
            "INSERT INTO identity.users(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO NOTHING RETURNING id",
            [i.email, i.display_name],
          )
        ).rows[0];
        if (!user)
          throw new ConflictException(
            "A conta já foi criada. Entre para aceitar.",
          );
        await c.query(
          "INSERT INTO identity.credentials(user_id,password_hash,mfa_required) VALUES($1,$2,$3)",
          [user.id, hash, i.is_owner || sensitive(i.permissions)],
        );
      }
      await c.query("SELECT set_config('app.auth_user_id',$1,true)", [user.id]);
      const existing = (
        await c.query(
          "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
          [i.tenant_id, user.id],
        )
      ).rows[0];
      if (existing)
        throw new ConflictException(
          "O vínculo já existe. Peça ao administrador para revisá-lo.",
        );
      await c.query(
        "INSERT INTO identity.memberships(tenant_id,user_id,role_id,is_owner,all_units) VALUES($1,$2,$3,$4,$5)",
        [i.tenant_id, user.id, i.role_id, i.is_owner, i.all_units],
      );
      const membership = (
        await c.query(
          "SELECT id FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2",
          [i.tenant_id, user.id],
        )
      ).rows[0];
      for (const unitId of i.unit_ids)
        await c.query(
          "INSERT INTO organizations.membership_units(tenant_id,membership_id,unit_id) VALUES($1,$2,$3)",
          [i.tenant_id, membership.id, unitId],
        );
      if (i.is_owner || sensitive(i.permissions))
        await c.query(
          "UPDATE identity.credentials SET mfa_required=true WHERE user_id=$1",
          [user.id],
        );
      await c.query(
        "UPDATE access.invitations SET accepted_at=now() WHERE tenant_id=$1 AND id=$2",
        [i.tenant_id, i.id],
      );
      await c.query("SELECT set_config('app.auth_user_id',$1,true)", [user.id]);
      await this.event(
        c,
        { tenantId: i.tenant_id, userId: user.id, permissions: [] },
        "invite.accepted",
        i.id,
      );
      return { ok: true };
    });
  }
}

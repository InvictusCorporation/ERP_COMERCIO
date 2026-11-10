import { Pool, type PoolClient } from "pg";

export type TenantContext = Readonly<{ userId: string; tenantId: string }>;
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export class TenantAccessDenied extends Error {
  constructor() {
    super("Contexto de acesso não autorizado.");
    this.name = "TenantAccessDenied";
  }
}

export async function assertRuntimeRole(
  client: Pick<PoolClient, "query">,
): Promise<void> {
  const result =
    await client.query(`SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
    r.rolcreaterole, r.rolreplication, r.rolinherit,
    EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS role_membership,
    EXISTS (SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=r.oid) AS owns_database,
    NOT (SELECT count(*)=8 AND coalesce(bool_and(c.relrowsecurity AND c.relforcerowsecurity),false)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname,c.relname) IN (('identity','memberships'),('tenancy','tenants'),('tenancy','settings'),('organizations','companies'),('organizations','units'),('organizations','membership_units'),('organizations','invitation_units'),('audit','events')))
      AS unsafe_rls,
    to_regprocedure('identity.has_active_tenant()') IS NULL AS missing_policy_function,
    pg_has_role(current_user, 'invictus_migrator', 'MEMBER') AS migration_member,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relowner=r.oid AND n.nspname IN ('identity','tenancy','infra','organizations','audit','inventory','purchasing','pos','finance','fiscal','supermarket','network','crm','reporting','commercial')) AS owns_tables
    FROM pg_roles r WHERE r.rolname=current_user`);
  const role = result.rows[0];
  if (
    !role ||
    role.rolname !== "invictus_app" ||
    Object.entries(role).some(
      ([key, value]) => key !== "rolname" && value === true,
    )
  ) {
    throw new Error(
      "A API exige papel de execução restrito, separado do migrador.",
    );
  }
}

export class TenantDatabase {
  private readonly pool: Pool;
  constructor(databaseUrl: string, maxConnections = 5) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: maxConnections,
      connectionTimeoutMillis: 1500,
      query_timeout: 5000,
      statement_timeout: 5000,
      idle_in_transaction_session_timeout: 10000,
    });
    this.pool.on("error", () => {});
  }
  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await assertRuntimeRole(client);
        const result = await client.query(
          "SELECT to_regclass('tenancy.settings') IS NOT NULL AS available",
        );
        return result.rows[0]?.available === true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }
  // Somente código interno. Identidade virá da sessão autenticada em 01.3;
  // nunca montar contexto a partir de IDs enviados livremente por HTTP.
  async withTenant<T>(
    context: TenantContext,
    action: (client: PoolClient, membershipId: string) => Promise<T>,
  ): Promise<T> {
    if (
      !context ||
      !uuid.test(context.userId || "") ||
      !uuid.test(context.tenantId || "")
    )
      throw new TenantAccessDenied();
    const client = await this.pool.connect();
    let discard = false;
    try {
      await assertRuntimeRole(client);
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",
        [context.userId, context.tenantId],
      );
      const membership = (
        await client.query(
          `SELECT m.id FROM identity.memberships m
        JOIN tenancy.tenants t ON t.id=m.tenant_id
        WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active AND t.active`,
          [context.tenantId, context.userId],
        )
      ).rows[0];
      if (!membership) throw new TenantAccessDenied();
      const result = await action(client, membership.id as string);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }
  async withUnit<T>(
    context: TenantContext & { unitId: string },
    action: (client: PoolClient, membershipId: string) => Promise<T>,
  ): Promise<T> {
    if (!uuid.test(context?.unitId || "")) throw new TenantAccessDenied();
    return this.withTenant(context, async (client, membershipId) => {
      await client.query("SELECT set_config('app.unit_id',$1,true)", [
        context.unitId,
      ]);
      const unit = (
        await client.query(
          "SELECT id FROM organizations.units WHERE id=$1 AND tenant_id=$2",
          [context.unitId, context.tenantId],
        )
      ).rows[0];
      if (!unit) throw new TenantAccessDenied();
      return action(client, membershipId);
    });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

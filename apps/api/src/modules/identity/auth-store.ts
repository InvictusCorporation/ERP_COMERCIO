import { Pool, type PoolClient } from "pg";
export class AuthStore {
  private readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 1500,
      query_timeout: 10000,
      statement_timeout: 10000,
      idle_in_transaction_session_timeout: 15000,
    });
    this.pool.on("error", () => {});
  }
  async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      const role = (
        await client.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication,
        EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=pg_roles.oid) AS database_owner,
        EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS member,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=pg_roles.oid AND n.nspname IN ('identity','tenancy','access')) AS owner,
        NOT(SELECT count(*)=5 AND coalesce(bool_and(c.relrowsecurity AND c.relforcerowsecurity),false) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('access','roles'),('access','invitations'),('access','events'),('identity','memberships'),('tenancy','tenants'))) AS unsafe_rls,
        to_regclass('identity.sessions') IS NULL AS missing FROM pg_roles WHERE rolname=current_user`)
      ).rows[0];
      if (
        !role ||
        role.rolname !== "invictus_auth" ||
        Object.entries(role).some(
          ([key, value]) => key !== "rolname" && value === true,
        )
      )
        throw new Error("Papel de autenticação inválido.");
      await client.query("BEGIN");
      const result = await action(client);
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
  async close() {
    await this.pool.end();
  }
}

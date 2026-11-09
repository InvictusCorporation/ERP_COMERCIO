import {
  TenantDatabase,
  type TenantContext,
} from "../../database/tenant-database";

// Ainda sem controller HTTP: falta autenticação e autorização por ação.
export class TenancyRepository {
  constructor(private readonly database: TenantDatabase) {}
  async current(context: TenantContext) {
    return this.database.withTenant(context, async (client) => {
      const result = await client.query(
        "SELECT id, name FROM tenancy.tenants WHERE id=$1",
        [context.tenantId],
      );
      return result.rows[0] as { id: string; name: string };
    });
  }
  async settings(context: TenantContext) {
    return this.database.withTenant(context, async (client) => {
      return (
        await client.query(
          "SELECT id, key, value FROM tenancy.settings ORDER BY key",
        )
      ).rows as { id: string; key: string; value: unknown }[];
    });
  }
}

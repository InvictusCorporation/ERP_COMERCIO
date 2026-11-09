import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { AuditFilters, AuditPage, AuditEntry } from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
const columns =
  'id,tenant_id AS "tenantId",unit_id AS "unitId",actor_id AS "actorId",actor_name AS "actorName",target_label AS "targetLabel",category,entity_type AS "entityType",entity_id AS "entityId",action,before_data AS before,after_data AS after,request_id AS "requestId",legacy,created_at AS "createdAt"';
export class AuditService {
  constructor(private readonly auth: AuthService) {}
  private run<T>(
    raw: string,
    scope: "personal" | "network",
    action: (c: PoolClient, tenantId: string | null) => Promise<T>,
  ) {
    if (scope === "personal")
      return this.auth.withIdentity(raw, (c) => action(c, null));
    return this.auth.withAccess(raw, (c, ctx) => {
      if (!ctx.permissions.includes("audit.read"))
        throw new ForbiddenException(
          "Você não tem permissão para consultar a auditoria da rede.",
        );
      return action(c, ctx.tenantId);
    });
  }
  async list(raw: string, filter: AuditFilters): Promise<AuditPage> {
    return this.run(raw, filter.scope, async (c, tenant) => {
      const params: unknown[] = [tenant];
      const conditions = ["tenant_id IS NOT DISTINCT FROM $1::uuid"];
      const add = (sql: string, v: unknown) => {
        params.push(v);
        conditions.push(sql.replaceAll("?", String(params.length)));
      };
      if (filter.category) add("category=$?::text", filter.category);
      if (filter.action) add("action=$?::text", filter.action);
      if (filter.actor === "system") conditions.push("actor_id IS NULL");
      else if (filter.actor) add("actor_id=$?::uuid", filter.actor);
      if (filter.unitId) add("unit_id=$?::uuid", filter.unitId);
      if (filter.entityId) add("entity_id=$?::uuid", filter.entityId);
      if (filter.requestId) add("request_id=$?::uuid", filter.requestId);
      if (filter.from)
        add("created_at >= $?::timestamptz", filter.from + "T00:00:00-03:00");
      if (filter.to)
        add(
          "created_at < ($?::timestamptz+interval '1 day')",
          filter.to + "T00:00:00-03:00",
        );
      if (filter.query) {
        const needle = "%" + filter.query.replace(/[\\%_]/g, "\\$&") + "%";
        add(
          "(target_label ILIKE $? ESCAPE '\\' OR actor_name ILIKE $? ESCAPE '\\' OR action ILIKE $? ESCAPE '\\')",
          needle,
        );
      }
      const where = conditions.join(" AND ");
      const counts = (
        await c.query(
          `SELECT count(*)::int AS total,count(*) FILTER(WHERE before_data IS NOT NULL OR after_data IS NOT NULL)::int AS changes,count(*) FILTER(WHERE legacy)::int AS legacy,count(DISTINCT request_id)::int AS operations FROM audit.events WHERE ${where}`,
          params,
        )
      ).rows[0];
      const items = (
        await c.query(
          `SELECT ${columns} FROM audit.events WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, filter.pageSize, filter.page * filter.pageSize],
        )
      ).rows;
      const actors = (
        await c.query(
          "SELECT DISTINCT ON(actor_id) coalesce(actor_id::text,'system') AS id,actor_name AS name FROM audit.events WHERE tenant_id IS NOT DISTINCT FROM $1::uuid ORDER BY actor_id,created_at DESC,id DESC",
          [tenant],
        )
      ).rows;
      const units = tenant
        ? (
            await c.query(
              "SELECT u.id,u.name FROM organizations.units u WHERE u.tenant_id=$1 AND EXISTS(SELECT 1 FROM audit.events e WHERE e.tenant_id=u.tenant_id AND e.unit_id=u.id) ORDER BY u.name",
              [tenant],
            )
          ).rows
        : [];
      return {
        items,
        total: counts.total,
        page: filter.page,
        pageSize: filter.pageSize,
        actors,
        units,
        summary: {
          changes: counts.changes,
          legacy: counts.legacy,
          operations: counts.operations,
        },
      };
    });
  }
  async detail(
    raw: string,
    scope: "personal" | "network",
    id: string,
  ): Promise<AuditEntry> {
    return this.run(raw, scope, async (c, tenant) => {
      const row = (
        await c.query(
          `SELECT ${columns} FROM audit.events WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2::uuid`,
          [id, tenant],
        )
      ).rows[0];
      if (!row)
        throw new NotFoundException(
          "Evento não encontrado no histórico autorizado.",
        );
      return row;
    });
  }
}

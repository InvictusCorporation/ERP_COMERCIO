import type { PoolClient } from "pg";
import { BadRequestException } from "@nestjs/common";
import type { UnitOption, UnitScope } from "@invictus/contracts";
export async function memberScope(
  c: PoolClient,
  userId: string,
  tenantId: string,
): Promise<UnitScope> {
  const m = (
    await c.query(
      "SELECT id,is_owner,all_units FROM identity.memberships WHERE tenant_id=$1 AND user_id=$2 AND active",
      [tenantId, userId],
    )
  ).rows[0];
  if (!m) return { allUnits: false, unitIds: [] };
  return {
    allUnits: m.is_owner || m.all_units,
    unitIds: (
      await c.query(
        "SELECT unit_id FROM organizations.membership_units WHERE tenant_id=$1 AND membership_id=$2 ORDER BY unit_id",
        [tenantId, m.id],
      )
    ).rows.map((r) => r.unit_id),
  };
}
export async function availableUnits(
  c: PoolClient,
  userId: string,
  tenantId: string,
): Promise<UnitOption[]> {
  const scope = await memberScope(c, userId, tenantId);
  return (
    await c.query(
      `SELECT u.id,u.name,u.code,u.kind,u.company_id AS "companyId",c.trade_name AS "companyName" FROM organizations.units u JOIN organizations.companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id WHERE u.tenant_id=$1 AND organizations.unit_available(u.id) AND ($2::boolean OR u.id=ANY($3::uuid[])) ORDER BY c.trade_name,u.kind,u.name`,
      [tenantId, scope.allUnits, scope.unitIds],
    )
  ).rows;
}
export async function validateScope(
  c: PoolClient,
  tenantId: string,
  scope: UnitScope,
  owner = false,
): Promise<UnitScope> {
  if (owner && !scope.allUnits)
    throw new BadRequestException(
      "Proprietário deve ter acesso a todas as unidades.",
    );
  if (scope.allUnits) {
    if (scope.unitIds.length)
      throw new BadRequestException(
        "Não selecione unidades ao conceder acesso a toda a rede.",
      );
    return scope;
  }
  const ids = [...new Set(scope.unitIds)];
  if (!ids.length || ids.length > 200)
    throw new BadRequestException("Selecione de 1 a 200 unidades disponíveis.");
  const found = (
    await c.query(
      "SELECT id FROM organizations.units WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND organizations.unit_available(id)",
      [tenantId, ids],
    )
  ).rows;
  if (found.length !== ids.length)
    throw new BadRequestException(
      "Uma ou mais unidades estão indisponíveis nesta rede.",
    );
  return { allUnits: false, unitIds: ids };
}
export function parseScope(
  allUnits: unknown,
  unitIds: unknown,
): UnitScope | undefined {
  if (allUnits === undefined && unitIds === undefined) return;
  if (
    typeof allUnits !== "boolean" ||
    !Array.isArray(unitIds) ||
    unitIds.length > 200 ||
    unitIds.some(
      (id) =>
        typeof id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          id,
        ),
    )
  )
    throw new BadRequestException("Escopo de unidades inválido.");
  return { allUnits, unitIds };
}

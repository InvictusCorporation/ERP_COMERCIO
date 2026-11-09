import { BadRequestException } from "@nestjs/common";
import {
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  type AuditFilters,
} from "@invictus/contracts";
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function value(v: unknown, max: number) {
  if (v === undefined || v === "") return undefined;
  if (typeof v !== "string" || v.length > max)
    throw new BadRequestException("Filtros de histórico inválidos.");
  return v;
}
function id(v: unknown) {
  const s = value(v, 36);
  if (s && !uuid.test(s))
    throw new BadRequestException("Identificador de filtro inválido.");
  return s;
}
function day(v: unknown) {
  const s = value(v, 10);
  if (!s) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number(s.slice(0, 4)) === 0 ||
    !Number.isFinite(Date.parse(s + "T00:00:00Z")) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw new BadRequestException("Período inválido.");
  return s;
}
export function auditFilters(query: Record<string, unknown>): AuditFilters {
  if (
    Object.keys(query).some(
      (k) =>
        ![
          "scope",
          "category",
          "action",
          "actor",
          "unitId",
          "entityId",
          "requestId",
          "from",
          "to",
          "query",
          "page",
          "pageSize",
        ].includes(k),
    )
  )
    throw new BadRequestException("Filtro não reconhecido.");
  const scope = value(query.scope, 8) || "network";
  if (scope !== "network" && scope !== "personal")
    throw new BadRequestException("Origem do histórico inválida.");
  const category = value(query.category, 20);
  if (category && !Object.hasOwn(AUDIT_CATEGORIES, category))
    throw new BadRequestException("Categoria inválida.");
  const action = value(query.action, 60);
  if (action && !Object.hasOwn(AUDIT_ACTIONS, action))
    throw new BadRequestException("Ação inválida.");
  const actor = value(query.actor, 36);
  if (actor && actor !== "system" && !uuid.test(actor))
    throw new BadRequestException("Responsável inválido.");
  const number = (v: unknown, def: number, max: number) => {
    if (v === undefined) return def;
    if (typeof v !== "string" || !/^\d{1,4}$/.test(v) || Number(v) > max)
      throw new BadRequestException("Página inválida.");
    return Number(v);
  };
  const from = day(query.from),
    to = day(query.to);
  if (from && to && from > to)
    throw new BadRequestException("Data inicial deve ser anterior à final.");
  const pageSize = number(query.pageSize, 20, 50);
  if (pageSize < 1)
    throw new BadRequestException("Tamanho de página inválido.");
  return {
    scope,
    category: category as AuditFilters["category"],
    action,
    actor,
    unitId: id(query.unitId),
    entityId: id(query.entityId),
    requestId: id(query.requestId),
    from,
    to,
    query: value(query.query, 100)?.trim(),
    page: number(query.page, 0, 1000),
    pageSize,
  };
}

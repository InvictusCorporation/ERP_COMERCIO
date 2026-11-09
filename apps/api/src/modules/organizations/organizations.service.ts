import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  LegalCompany,
  OrganizationUnit,
  OrganizationOverview,
  UnitKind,
} from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
type CompanyInput = Omit<LegalCompany, "id"> & {
  id?: string;
  matrixCode: string;
};
type UnitInput = Omit<OrganizationUnit, "id" | "available"> & { id?: string };
const companySelect =
  'id,legal_name AS "legalName",trade_name AS "tradeName",cnpj,state_registration AS "stateRegistration",email,phone,address,city,state,postal_code AS "postalCode",active';
const unitSelect =
  'id,company_id AS "companyId",parent_id AS "parentId",name,code,kind,cnpj,address,city,state,postal_code AS "postalCode",active,organizations.unit_available(id) AS available';
const missing = () =>
  new NotFoundException("Registro não encontrado nas unidades autorizadas.");
export class OrganizationsService {
  constructor(private readonly auth: AuthService) {}
  private async event(
    c: PoolClient,
    tenantId: string,
    userId: string,
    action: string,
    target: string,
  ) {
    await c.query(
      "INSERT INTO access.events(tenant_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
      [tenantId, userId, action, target],
    );
  }
  private manage(ctx: { permissions: string[]; allUnits: boolean }) {
    if (!ctx.allUnits || !ctx.permissions.includes("organizations.manage"))
      throw new ForbiddenException(
        "Você não tem permissão para gerenciar a estrutura da rede.",
      );
  }
  async overview(raw: string): Promise<OrganizationOverview> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      if (!ctx.permissions.includes("organizations.read"))
        throw new ForbiddenException(
          "Você não tem permissão para consultar a estrutura.",
        );
      const units: OrganizationUnit[] = (
        await c.query(
          `SELECT ${unitSelect} FROM organizations.units WHERE tenant_id=$1 AND ($2::boolean OR (id=ANY($3::uuid[]) AND organizations.unit_available(id))) ORDER BY company_id,CASE kind WHEN 'matriz' THEN 0 WHEN 'filial' THEN 1 WHEN 'cd' THEN 2 ELSE 3 END,name`,
          [ctx.tenantId, ctx.allUnits, ctx.unitIds],
        )
      ).rows;
      const companies = (
        await c.query(
          `SELECT ${companySelect} FROM organizations.companies WHERE tenant_id=$1 AND ($2::boolean OR id=ANY($3::uuid[])) ORDER BY trade_name`,
          [
            ctx.tenantId,
            ctx.allUnits,
            [...new Set(units.map((u) => u.companyId))],
          ],
        )
      ).rows;
      const network = (
        await c.query("SELECT name FROM tenancy.tenants WHERE id=$1", [
          ctx.tenantId,
        ])
      ).rows[0].name;
      return {
        companies,
        units,
        network,
        allUnits: ctx.allUnits,
        canManage:
          ctx.allUnits && ctx.permissions.includes("organizations.manage"),
      };
    });
  }
  async unit(raw: string, id: string) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      if (!ctx.permissions.includes("organizations.read"))
        throw new ForbiddenException("Consulta não autorizada.");
      const unit = (
        await c.query(
          `SELECT ${unitSelect} FROM organizations.units WHERE tenant_id=$1 AND id=$2 AND ($3::boolean OR (id=ANY($4::uuid[]) AND organizations.unit_available(id)))`,
          [ctx.tenantId, id, ctx.allUnits, ctx.unitIds],
        )
      ).rows[0];
      if (!unit) throw missing();
      return unit;
    });
  }
  async saveCompany(raw: string, input: CompanyInput) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.manage(ctx);
      let previous: LegalCompany | undefined;
      let matrix: { id: string; code: string } | undefined;
      if (input.id) {
        previous = (
          await c.query(
            `SELECT ${companySelect} FROM organizations.companies WHERE tenant_id=$1 AND id=$2`,
            [ctx.tenantId, input.id],
          )
        ).rows[0];
        if (!previous) throw missing();
        matrix = (
          await c.query(
            "SELECT id,code FROM organizations.units WHERE tenant_id=$1 AND company_id=$2 AND kind='matriz'",
            [ctx.tenantId, input.id],
          )
        ).rows[0];
        if (previous.cnpj !== input.cnpj || matrix?.code !== input.matrixCode)
          throw new ConflictException(
            "CNPJ e código da matriz são permanentes. Cadastre uma nova empresa para outra identidade legal.",
          );
      }
      const duplicate = (
        await c.query(
          "SELECT id FROM organizations.companies WHERE tenant_id=$1 AND left(cnpj,8)=left($2,8) AND ($3::uuid IS NULL OR id<>$3)",
          [ctx.tenantId, input.cnpj, input.id || null],
        )
      ).rowCount;
      if (duplicate)
        throw new ConflictException(
          "Esta raiz de CNPJ já possui uma empresa na rede. Cadastre uma filial nela.",
        );
      if (
        !input.id &&
        (
          await c.query(
            "SELECT id FROM organizations.units WHERE tenant_id=$1 AND code=$2",
            [ctx.tenantId, input.matrixCode],
          )
        ).rowCount
      )
        throw new ConflictException(
          "Código de unidade já utilizado nesta rede.",
        );
      const values = [
        input.legalName,
        input.tradeName,
        input.cnpj,
        input.stateRegistration,
        input.email,
        input.phone,
        input.address,
        input.city,
        input.state,
        input.postalCode,
        input.active,
        ctx.tenantId,
      ];
      const company = input.id
        ? (
            await c.query(
              "UPDATE organizations.companies SET legal_name=$1,trade_name=$2,cnpj=$3,state_registration=$4,email=$5,phone=$6,address=$7,city=$8,state=$9,postal_code=$10,active=$11,updated_at=now() WHERE tenant_id=$12 AND id=$13 RETURNING id",
              [...values, input.id],
            )
          ).rows[0]
        : (
            await c.query(
              "INSERT INTO organizations.companies(legal_name,trade_name,cnpj,state_registration,email,phone,address,city,state,postal_code,active,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
              values,
            )
          ).rows[0];
      if (!input.id) {
        matrix = (
          await c.query(
            "INSERT INTO organizations.units(tenant_id,company_id,kind,code,name,cnpj,address,city,state,postal_code,active) VALUES($1,$2,'matriz',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,code",
            [
              ctx.tenantId,
              company.id,
              input.matrixCode,
              input.tradeName.slice(0, 110) + " · Matriz",
              input.cnpj,
              input.address,
              input.city,
              input.state,
              input.postalCode,
              input.active,
            ],
          )
        ).rows[0];
        await this.event(
          c,
          ctx.tenantId,
          ctx.userId,
          "unit.created",
          matrix!.id,
        );
      }
      await this.event(
        c,
        ctx.tenantId,
        ctx.userId,
        input.id ? "company.changed" : "company.created",
        company.id,
      );
      return { ok: true, id: company.id, matrixId: matrix!.id };
    });
  }
  async saveUnit(raw: string, input: UnitInput) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.manage(ctx);
      if (input.kind !== "matriz" && !input.parentId)
        throw new BadRequestException("Selecione uma unidade superior válida.");
      const company = (
        await c.query(
          "SELECT id,cnpj,active FROM organizations.companies WHERE tenant_id=$1 AND id=$2",
          [ctx.tenantId, input.companyId],
        )
      ).rows[0];
      if (!company) throw missing();
      let previous: OrganizationUnit | undefined;
      if (input.id) {
        previous = (
          await c.query(
            `SELECT ${unitSelect} FROM organizations.units WHERE tenant_id=$1 AND id=$2`,
            [ctx.tenantId, input.id],
          )
        ).rows[0];
        if (!previous) throw missing();
        if (
          previous.companyId !== input.companyId ||
          previous.kind !== input.kind ||
          previous.parentId !== input.parentId ||
          previous.code !== input.code ||
          previous.cnpj !== input.cnpj
        )
          throw new ConflictException(
            "Empresa, vínculo superior, tipo, código e CNPJ são permanentes.",
          );
      } else if (input.kind === "matriz")
        throw new BadRequestException("A matriz é criada junto com a empresa.");
      if (input.cnpj && input.cnpj.slice(0, 8) !== company.cnpj.slice(0, 8))
        throw new BadRequestException(
          "O CNPJ da unidade deve pertencer à mesma raiz da empresa.",
        );
      if (input.kind === "matriz" && input.cnpj !== company.cnpj)
        throw new BadRequestException(
          "O CNPJ da matriz deve ser o da empresa.",
        );
      if (input.parentId) {
        const parent = (
          await c.query(
            "SELECT id,company_id,kind,organizations.unit_available(id) AS available FROM organizations.units WHERE tenant_id=$1 AND id=$2",
            [ctx.tenantId, input.parentId],
          )
        ).rows[0];
        if (!parent || parent.company_id !== input.companyId) throw missing();
        if (
          input.kind === "deposito"
            ? parent.kind === "deposito"
            : parent.kind !== "matriz"
        )
          throw new BadRequestException(
            "Vínculo superior inválido para este tipo de unidade.",
          );
        if (input.active && !parent.available)
          throw new ConflictException(
            "Ative a unidade superior antes de ativar esta unidade.",
          );
      }
      if (input.active && !company.active)
        throw new ConflictException(
          "Ative a empresa antes de ativar esta unidade.",
        );
      const duplicates = (
        await c.query(
          "SELECT id FROM organizations.units WHERE tenant_id=$1 AND (code=$2 OR ($3::text IS NOT NULL AND cnpj=$3)) AND ($4::uuid IS NULL OR id<>$4)",
          [ctx.tenantId, input.code, input.cnpj, input.id || null],
        )
      ).rowCount;
      if (duplicates)
        throw new ConflictException(
          "Código ou CNPJ de unidade já utilizado nesta rede.",
        );
      const values = [
        input.companyId,
        input.parentId,
        input.kind,
        input.code,
        input.name,
        input.cnpj,
        input.address,
        input.city,
        input.state,
        input.postalCode,
        input.active,
        ctx.tenantId,
      ];
      const result = input.id
        ? (
            await c.query(
              "UPDATE organizations.units SET company_id=$1,parent_id=$2,kind=$3,code=$4,name=$5,cnpj=$6,address=$7,city=$8,state=$9,postal_code=$10,active=$11,updated_at=now() WHERE tenant_id=$12 AND id=$13 RETURNING id",
              [...values, input.id],
            )
          ).rows[0]
        : (
            await c.query(
              "INSERT INTO organizations.units(company_id,parent_id,kind,code,name,cnpj,address,city,state,postal_code,active,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
              values,
            )
          ).rows[0];
      await this.event(
        c,
        ctx.tenantId,
        ctx.userId,
        input.id ? "unit.changed" : "unit.created",
        result.id,
      );
      return { ok: true, id: result.id };
    });
  }
}

import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type {
  ProductInput,
  MovementInput,
  InventoryPage,
  ProductDetail,
  Permission,
} from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
const productSelect = `p.id,p.version,p.code,p.name,p.description,p.category,p.brand,p.base_unit AS "baseUnit",p.package_name AS "packageName",p.package_factor::text AS "packageFactor",p.barcodes,p.sale_price::text AS "salePrice",p.desired_margin::text AS "desiredMargin",p.minimum_margin::text AS "minimumMargin",p.minimum_stock::text AS "minimumStock",p.ideal_stock::text AS "idealStock",p.active`;
const stockSelect = `jsonb_build_object('physical',coalesce(l.physical,0)::text,'reserved',coalesce(l.reserved,0)::text,'available',(coalesce(l.physical,0)-coalesce(l.reserved,0))::text,'value',coalesce(l.value,0)::text,'averageCost',CASE WHEN l.physical>0 THEN round(l.value/l.physical,6)::text ELSE '0' END,'lastCost',coalesce(l.last_cost,0)::text,'minimumStock',coalesce(s.minimum_stock,p.minimum_stock)::text,'idealStock',coalesce(s.ideal_stock,p.ideal_stock)::text)`;
const from = ` FROM inventory.products p LEFT JOIN inventory.levels l ON l.tenant_id=p.tenant_id AND l.product_id=p.id AND l.unit_id=$2 LEFT JOIN inventory.settings s ON s.tenant_id=p.tenant_id AND s.product_id=p.id AND s.unit_id=$2 `;
const missing = () =>
  new NotFoundException(
    "Produto ou unidade não encontrado no acesso autorizado.",
  );
type Ctx = {
  permissions: Permission[];
  tenantId: string;
  userId: string;
  allUnits: boolean;
  unitIds: string[];
  activeUnitId: string | null;
};
export class InventoryService {
  constructor(private readonly auth: AuthService) {}
  private require(ctx: Ctx, permission: Permission) {
    if (!ctx.permissions.includes(permission))
      throw new ForbiddenException("Você não tem permissão para esta ação.");
  }
  private async unit(
    c: PoolClient,
    ctx: Ctx,
    id: string | null,
    required = false,
  ) {
    if (!id) {
      if (required)
        throw new BadRequestException(
          "Selecione uma unidade para consultar ou movimentar estoque.",
        );
      return;
    }
    const result = await c.query(
      "SELECT inventory.allowed($1,$2,$3) AS allowed",
      [ctx.tenantId, "stock.read", id],
    );
    if (!result.rows[0]?.allowed) throw missing();
  }
  private async guarded<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505")
        throw new ConflictException(
          "Código interno, código de barras ou confirmação já registrado. Atualize a consulta.",
        );
      if (code === "23514")
        throw new ConflictException(
          "Confira o saldo disponível, a precisão da conversão e as regras de estorno. Código e unidade-base são permanentes.",
        );
      if (code === "42501")
        throw new ForbiddenException("Operação não autorizada nesta unidade.");
      if (code === "22003")
        throw new BadRequestException(
          "Quantidade ou valor excede o limite permitido.",
        );
      throw e;
    }
  }
  async list(
    raw: string,
    filter: { unitId?: string; query: string; status: string; page: number },
  ): Promise<InventoryPage> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "products.read");
      const unit =
        filter.unitId ||
        (ctx.permissions.includes("stock.read") ? ctx.activeUnitId : null);
      await this.unit(c, ctx, unit);
      const canReadStock = ctx.permissions.includes("stock.read");
      const where = ` WHERE p.tenant_id=$1 AND ($3='' OR position(lower($3) in lower(p.name||' '||p.code||' '||p.category||' '||array_to_string(p.barcodes,' ')))>0 OR EXISTS(SELECT 1 FROM inventory.barcodes b WHERE b.tenant_id=p.tenant_id AND b.product_id=p.id AND b.barcode=lpad($3,14,'0'))) AND ($4='all' OR ($4='active' AND p.active) OR ($4='inactive' AND NOT p.active) OR ($4='low' AND p.active AND coalesce(l.physical,0)-coalesce(l.reserved,0)<=coalesce(s.minimum_stock,p.minimum_stock)))`;
      if (filter.status === "low" && (!unit || !canReadStock))
        throw new BadRequestException(
          "Selecione uma unidade autorizada para filtrar estoque baixo.",
        );
      const values = [ctx.tenantId, unit, filter.query, filter.status];
      const items = (
        await c.query(
          "SELECT " +
            productSelect +
            ", " +
            (unit && canReadStock ? stockSelect : "NULL") +
            " AS stock" +
            from +
            where +
            " ORDER BY p.name,p.id LIMIT 20 OFFSET $5",
          [...values, filter.page * 20],
        )
      ).rows;
      const total = Number(
        (await c.query("SELECT count(*)" + from + where, values)).rows[0].count,
      );
      const summary = (
        await c.query(
          `SELECT count(*)::int AS products,coalesce(sum(l.value),0)::text AS value,count(*) FILTER(WHERE p.active AND coalesce(l.physical,0)-coalesce(l.reserved,0)<=coalesce(s.minimum_stock,p.minimum_stock))::int AS low,count(*) FILTER(WHERE p.active AND coalesce(l.physical,0)-coalesce(l.reserved,0)=0)::int AS empty` +
            from +
            " WHERE p.tenant_id=$1",
          [ctx.tenantId, unit],
        )
      ).rows[0];
      if (!unit || !canReadStock) {
        summary.value = "0";
        summary.low = 0;
        summary.empty = 0;
      }
      return {
        items,
        total,
        page: filter.page,
        unitId: unit,
        canManageProducts:
          ctx.allUnits && ctx.permissions.includes("products.manage"),
        canManageStock: !!unit && ctx.permissions.includes("stock.manage"),
        canReadStock,
        summary,
      };
    });
  }
  async detail(
    raw: string,
    id: string,
    unitId?: string,
    page = 0,
  ): Promise<ProductDetail> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "products.read");
      const unit =
        unitId ||
        (ctx.permissions.includes("stock.read") ? ctx.activeUnitId : null);
      await this.unit(c, ctx, unit);
      const stock = !!unit && ctx.permissions.includes("stock.read");
      const product = (
        await c.query(
          "SELECT " +
            productSelect +
            ", " +
            (stock ? stockSelect : "NULL") +
            " AS stock" +
            from +
            " WHERE p.tenant_id=$1 AND p.id=$3",
          [ctx.tenantId, unit, id],
        )
      ).rows[0];
      if (!product) throw missing();
      const movements = stock
        ? (
            await c.query(
              `SELECT sale_id AS "saleId",purchase_receipt_id AS "purchaseReceiptId",id,kind,quantity::text,factor::text,base_quantity::text AS "baseQuantity",cost::text,physical_delta::text AS "physicalDelta",reserved_delta::text AS "reservedDelta",value_delta::text AS "valueDelta",physical_after::text AS "physicalAfter",reserved_after::text AS "reservedAfter",value_after::text AS "valueAfter",actor_name AS "actorName",reason,reversal_of AS "reversalOf",created_at AS "createdAt" FROM inventory.movements WHERE tenant_id=$1 AND unit_id=$2 AND product_id=$3 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $4`,
              [ctx.tenantId, unit, id, page * 20],
            )
          ).rows
        : [];
      const count = stock
        ? Number(
            (
              await c.query(
                "SELECT count(*) FROM inventory.movements WHERE tenant_id=$1 AND unit_id=$2 AND product_id=$3",
                [ctx.tenantId, unit, id],
              )
            ).rows[0].count,
          )
        : 0;
      return { product, movements, movementTotal: count, movementPage: page };
    });
  }
  async save(raw: string, i: ProductInput) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "products.manage");
        if (!ctx.allUnits)
          throw new ForbiddenException(
            "O catálogo e os preços são gerenciados por quem tem acesso à rede inteira.",
          );
        const values = [
          ctx.tenantId,
          i.code,
          i.name,
          i.description,
          i.category,
          i.brand,
          i.baseUnit,
          i.packageName,
          i.packageFactor,
          i.barcodes,
          i.salePrice,
          i.desiredMargin,
          i.minimumMargin,
          i.minimumStock,
          i.idealStock,
          i.active,
        ];
        let result;
        if (i.id) {
          result = (
            await c.query(
              `UPDATE inventory.products SET name=$3,description=$4,category=$5,brand=$6,package_name=$8,package_factor=$9,barcodes=$10,sale_price=$11,desired_margin=$12,minimum_margin=$13,minimum_stock=$14,ideal_stock=$15,active=$16,code=$2,base_unit=$7,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$17 AND version=$18 RETURNING id,version`,
              [...values, i.id, i.version],
            )
          ).rows[0];
          if (!result)
            throw new ConflictException(
              "Produto alterado por outra pessoa ou indisponível. Atualize antes de salvar.",
            );
        } else
          result = (
            await c.query(
              `INSERT INTO inventory.products(tenant_id,code,name,description,category,brand,base_unit,package_name,package_factor,barcodes,sale_price,desired_margin,minimum_margin,minimum_stock,ideal_stock,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,version`,
              values,
            )
          ).rows[0];
        return { ok: true, ...result };
      }),
    );
  }
  async move(raw: string, i: MovementInput) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "stock.manage");
        await this.unit(c, ctx, i.unitId, true);
        const previous = (
          await c.query(
            "SELECT id,unit_id,product_id,kind,quantity,packaged,cost,reason,reversal_of FROM inventory.movements WHERE tenant_id=$1 AND request_key=$2",
            [ctx.tenantId, i.requestKey],
          )
        ).rows[0];
        if (previous) {
          if (
            previous.unit_id !== i.unitId ||
            previous.product_id !== i.productId ||
            previous.kind !== i.kind ||
            previous.reason !== i.reason ||
            (previous.reversal_of || undefined) !== i.reversalOf ||
            (i.kind !== "reverse" &&
              (Number(previous.quantity) !== Number(i.quantity) ||
                previous.packaged !== i.packaged ||
                Number(previous.cost) !== Number(i.cost)))
          )
            throw new ConflictException(
              "Esta confirmação já foi usada com outros dados.",
            );
          return { ok: true, id: previous.id, replayed: true };
        }
        const result = (
          await c.query(
            `INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,reversal_of,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [
              ctx.tenantId,
              i.unitId,
              i.productId,
              i.kind,
              i.quantity,
              i.packaged,
              i.cost,
              i.reason,
              i.reversalOf || null,
              i.requestKey,
            ],
          )
        ).rows[0];
        return { ok: true, id: result.id, replayed: false };
      }),
    );
  }
  async settings(
    raw: string,
    i: {
      unitId: string;
      productId: string;
      minimumStock: string;
      idealStock: string;
    },
  ) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "stock.manage");
        await this.unit(c, ctx, i.unitId, true);
        if (Number(i.idealStock) < Number(i.minimumStock))
          throw new BadRequestException(
            "Estoque ideal deve ser maior ou igual ao mínimo.",
          );
        if (
          !(
            await c.query(
              "SELECT id FROM inventory.products WHERE tenant_id=$1 AND id=$2 AND active",
              [ctx.tenantId, i.productId],
            )
          ).rowCount
        )
          throw missing();
        await c.query(
          `INSERT INTO inventory.settings(tenant_id,unit_id,product_id,minimum_stock,ideal_stock) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,unit_id,product_id) DO UPDATE SET minimum_stock=excluded.minimum_stock,ideal_stock=excluded.ideal_stock`,
          [ctx.tenantId, i.unitId, i.productId, i.minimumStock, i.idealStock],
        );
        return { ok: true };
      }),
    );
  }
}

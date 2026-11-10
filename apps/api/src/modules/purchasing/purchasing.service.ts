import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import type {
  Permission,
  PurchaseInput,
  ReceiveInput,
  SupplierInput,
  PurchasePage,
  PurchaseDetail,
  SupplierPage,
  PurchaseOptions,
} from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
const supplierSelect =
  'id,version,legal_name AS "legalName",name,cnpj,state_registration AS "stateRegistration",contact_name AS "contactName",email,phone,address,city,state,postal_code AS "postalCode",delivery_days AS "deliveryDays",payment_terms AS "paymentTerms",notes,active';
const orderSelect = `o.id,o.number,o.version,o.unit_id AS "unitId",u.name AS "unitName",o.supplier_id AS "supplierId",o.supplier_snapshot AS supplier,o.items,o.status,o.freight::text,o.extra_cost::text AS "extraCost",o.discount::text,o.total::text,coalesce(to_char(o.expected_date,'YYYY-MM-DD'),'') AS "expectedDate",o.notes,o.cancel_reason AS "cancelReason",o.actor_name AS "actorName",o.approved_by AS "approvedBy",o.approved_at AS "approvedAt",o.created_at AS "createdAt"`;
const orderFrom =
  " FROM purchasing.orders o JOIN organizations.units u ON u.tenant_id=o.tenant_id AND u.id=o.unit_id ";
export class PurchasingService {
  constructor(private readonly auth: AuthService) {}
  private require(ctx: { permissions: Permission[] }, p: Permission) {
    if (!ctx.permissions.includes(p))
      throw new ForbiddenException("Você não tem permissão para esta ação.");
  }
  private async guarded<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P0801") throw new ConflictException("Controle de lotes: confira classificação, validade, bloqueio e reservas. Regularize os lotes antes de vender ou estornar a entrada.");
      if(code === "P1001")throw new ConflictException("Operação vinculada à rede: confira estado da transferência, compra centralizada e escopo das unidades.");
      if (code === "23505")
        throw new ConflictException(
          "Cadastro ou confirmação já registrado. Atualize a consulta.",
        );
      if (code === "P0501") throw new ConflictException("Estorne as baixas e cancele o título financeiro vinculado antes de estornar o recebimento.");
      if (code === "23514")
        throw new ConflictException(
          "Pedido desatualizado ou operação incompatível com o estado atual. Confira quantidades, valores e regras de estorno.",
        );
      if (code === "42501")
        throw new ForbiddenException("Ação não autorizada nesta unidade.");
      if (code === "22003")
        throw new BadRequestException(
          "Quantidade ou valor excede o limite permitido.",
        );
      throw e;
    }
  }
  async suppliers(
    raw: string,
    query: string,
    status: string,
    page: number,
  ): Promise<SupplierPage> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "suppliers.read");
      const where = ` WHERE tenant_id=$1 AND ($2='' OR position(lower($2) in lower(name||' '||legal_name||' '||cnpj||' '||contact_name))>0) AND ($3='all' OR ($3='active' AND active) OR ($3='inactive' AND NOT active))`;
      const values = [ctx.tenantId, query, status];
      return {
        items: (
          await c.query(
            "SELECT " +
              supplierSelect +
              " FROM purchasing.suppliers" +
              where +
              " ORDER BY name,id LIMIT 20 OFFSET $4",
            [...values, page * 20],
          )
        ).rows,
        total: Number(
          (
            await c.query(
              "SELECT count(*) FROM purchasing.suppliers" + where,
              values,
            )
          ).rows[0].count,
        ),
        page,
        active: Number(
          (
            await c.query(
              "SELECT count(*) FROM purchasing.suppliers WHERE tenant_id=$1 AND active",
              [ctx.tenantId],
            )
          ).rows[0].count,
        ),
        canManage: ctx.allUnits && ctx.permissions.includes("suppliers.manage"),
      };
    });
  }
  async supplier(raw: string, id: string) {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "suppliers.read");
      const r = (
        await c.query(
          "SELECT " +
            supplierSelect +
            " FROM purchasing.suppliers WHERE tenant_id=$1 AND id=$2",
          [ctx.tenantId, id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException("Fornecedor não encontrado.");
      return r;
    });
  }
  async saveSupplier(raw: string, i: SupplierInput) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "suppliers.manage");
        if (!ctx.allUnits)
          throw new ForbiddenException(
            "O cadastro central de fornecedores exige acesso à rede inteira.",
          );
        const values = [
          ctx.tenantId,
          i.legalName,
          i.name,
          i.cnpj,
          i.stateRegistration,
          i.contactName,
          i.email,
          i.phone,
          i.address,
          i.city,
          i.state,
          i.postalCode,
          i.deliveryDays,
          i.paymentTerms,
          i.notes,
          i.active,
        ];
        const result = i.id
          ? (
              await c.query(
                `UPDATE purchasing.suppliers SET legal_name=$2,name=$3,cnpj=$4,state_registration=$5,contact_name=$6,email=$7,phone=$8,address=$9,city=$10,state=$11,postal_code=$12,delivery_days=$13,payment_terms=$14,notes=$15,active=$16,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$17 AND version=$18 RETURNING id,version`,
                [...values, i.id, i.version],
              )
            ).rows[0]
          : (
              await c.query(
                `INSERT INTO purchasing.suppliers(tenant_id,legal_name,name,cnpj,state_registration,contact_name,email,phone,address,city,state,postal_code,delivery_days,payment_terms,notes,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id,version`,
                values,
              )
            ).rows[0];
        if (!result)
          throw new ConflictException(
            "Fornecedor desatualizado ou indisponível. Atualize antes de salvar.",
          );
        return { ok: true, ...result };
      }),
    );
  }
  async options(
    raw: string,
    supplierQuery: string,
    productQuery: string,
  ): Promise<PurchaseOptions> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "purchases.read");
      return {
        suppliers: (
          await c.query(
            `SELECT id,name FROM purchasing.suppliers WHERE tenant_id=$1 AND active AND ($2='' OR position(lower($2) in lower(name||' '||cnpj))>0) ORDER BY name LIMIT 100`,
            [ctx.tenantId, supplierQuery],
          )
        ).rows,
        products: (
          await c.query(
            `SELECT id,code,name,base_unit AS "baseUnit",package_name AS "packageName",package_factor::text AS "packageFactor" FROM inventory.products WHERE tenant_id=$1 AND active AND ($2='' OR position(lower($2) in lower(name||' '||code||' '||array_to_string(barcodes,' ')))>0) ORDER BY name LIMIT 100`,
            [ctx.tenantId, productQuery],
          )
        ).rows,
        units: (
          await c.query(
            `SELECT id,name FROM organizations.units WHERE tenant_id=$1 AND inventory.allowed(tenant_id,'purchases.read',id) ORDER BY name`,
            [ctx.tenantId],
          )
        ).rows,
      };
    });
  }
  async orders(
    raw: string,
    filter: {
      query: string;
      status: string;
      unitId?: string;
      supplierId?: string;
      page: number;
    },
  ): Promise<PurchasePage> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "purchases.read");
      const unit = filter.unitId || ctx.activeUnitId;
      if (
        unit &&
        !(
          await c.query(
            "SELECT inventory.allowed($1,'purchases.read',$2) AS allowed",
            [ctx.tenantId, unit],
          )
        ).rows[0].allowed
      )
        throw new NotFoundException(
          "Unidade não encontrada no acesso autorizado.",
        );
      const scope =
        " WHERE o.tenant_id=$1 AND ($2::uuid IS NULL OR o.unit_id=$2) AND ($3::uuid IS NULL OR o.supplier_id=$3)";
      const where =
        scope +
        ` AND ($4='' OR position(lower($4) in lower(o.number||' '||(o.supplier_snapshot->>'name')))>0) AND ($5='all' OR o.status=$5)`;
      const values = [
        ctx.tenantId,
        unit,
        filter.supplierId || null,
        filter.query,
        filter.status,
      ];
      const summary = (
        await c.query(
          `SELECT count(*) FILTER(WHERE o.status='draft')::int AS draft,count(*) FILTER(WHERE o.status='approved')::int AS approved,count(*) FILTER(WHERE o.status='partial')::int AS partial,count(*) FILTER(WHERE o.status='received')::int AS received,coalesce(sum(CASE WHEN o.status IN('approved','partial') THEN o.total-(SELECT coalesce(sum((x->>'receivedValue')::numeric),0) FROM jsonb_array_elements(o.items) x) ELSE 0 END),0)::text AS "openValue"` +
            orderFrom +
            scope,
          values.slice(0, 3),
        )
      ).rows[0];
      return {
        items: (
          await c.query(
            "SELECT " +
              orderSelect +
              orderFrom +
              where +
              " ORDER BY o.created_at DESC,o.id DESC LIMIT 20 OFFSET $6",
            [...values, filter.page * 20],
          )
        ).rows,
        total: Number(
          (await c.query("SELECT count(*)" + orderFrom + where, values)).rows[0]
            .count,
        ),
        page: filter.page,
        summary,
        capabilities: {
          manage: ctx.permissions.includes("purchases.manage"),
          approve: ctx.permissions.includes("purchases.approve"),
          receive:
            ctx.permissions.includes("purchases.receive") &&
            ctx.permissions.includes("stock.manage"),
        },
      };
    });
  }
  async detail(raw: string, id: string, page = 0): Promise<PurchaseDetail> {
    return this.auth.withAccess(raw, async (c, ctx) => {
      this.require(ctx, "purchases.read");
      const order = (
        await c.query(
          "SELECT " +
            orderSelect +
            orderFrom +
            " WHERE o.tenant_id=$1 AND o.id=$2",
          [ctx.tenantId, id],
        )
      ).rows[0];
      if (!order)
        throw new NotFoundException(
          "Pedido não encontrado no acesso autorizado.",
        );
      return {
        order,
        receiptPage: page,
        receiptTotal: Number(
          (
            await c.query(
              "SELECT count(*) FROM purchasing.receipts WHERE tenant_id=$1 AND order_id=$2",
              [ctx.tenantId, id],
            )
          ).rows[0].count,
        ),
        receipts: (
          await c.query(
            `SELECT id,order_id AS "orderId",items,status,document,notes,total::text,actor_name AS "actorName",created_at AS "createdAt",reversal_reason AS "reversalReason",reversed_by AS "reversedBy",reversed_at AS "reversedAt" FROM purchasing.receipts WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3`,
            [ctx.tenantId, id, page * 20],
          )
        ).rows,
      };
    });
  }
  async save(raw: string, input: PurchaseInput) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "purchases.manage");
        const r = await c.query(
          "SELECT purchasing.save_order($1::jsonb) AS id",
          [JSON.stringify(input)],
        );
        return { ok: true, id: r.rows[0].id };
      }),
    );
  }
  async transition(
    raw: string,
    id: string,
    version: number,
    action: string,
    reason: string,
  ) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(
          ctx,
          action === "approve" ? "purchases.approve" : "purchases.manage",
        );
        const r = await c.query(
          "SELECT purchasing.transition_order($1,$2,$3,$4) AS id",
          [id, version, action, reason],
        );
        return { ok: true, id: r.rows[0].id };
      }),
    );
  }
  async receive(raw: string, input: ReceiveInput) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "purchases.receive");
        this.require(ctx, "stock.manage");
        const r = await c.query(
          "SELECT purchasing.receive_order($1::jsonb) AS id",
          [JSON.stringify(input)],
        );
        const warnings = (
          await c.query(
            `SELECT p.id,p.name,round(l.value/nullif(l.physical,0),6)::text AS "averageCost",p.sale_price::text AS "salePrice",round(100*(p.sale_price-l.value/nullif(l.physical,0))/nullif(p.sale_price,0),2)::text AS margin,(ceil((l.value/nullif(l.physical,0))/(1-greatest(p.desired_margin,p.minimum_margin)/100)*100)/100)::text AS "suggestedPrice",greatest(p.desired_margin,p.minimum_margin)::text AS "targetMargin" FROM purchasing.receipts r JOIN inventory.levels l ON l.tenant_id=r.tenant_id AND l.unit_id=r.unit_id JOIN inventory.products p ON p.tenant_id=l.tenant_id AND p.id=l.product_id WHERE r.tenant_id=$1 AND r.id=$2 AND r.status='confirmed' AND l.physical>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.items) x WHERE x->>'productId'=p.id::text) AND (p.sale_price=0 OR 100*(p.sale_price-l.value/nullif(l.physical,0))/nullif(p.sale_price,0)<greatest(p.desired_margin,p.minimum_margin)) ORDER BY p.name`,
            [ctx.tenantId, r.rows[0].id],
          )
        ).rows;
        return { ok: true, id: r.rows[0].id, warnings };
      }),
    );
  }
  async reverse(
    raw: string,
    id: string,
    version: number,
    reason: string,
    requestKey: string,
  ) {
    return this.guarded(() =>
      this.auth.withAccess(raw, async (c, ctx) => {
        this.require(ctx, "purchases.receive");
        this.require(ctx, "stock.manage");
        const r = await c.query(
          "SELECT purchasing.reverse_receipt($1,$2,$3,$4) AS id",
          [id, version, reason, requestKey],
        );
        return { ok: true, id: r.rows[0].id };
      }),
    );
  }
}

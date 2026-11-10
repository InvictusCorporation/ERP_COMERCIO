import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { LotOverview, Permission } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
type Context = {
    tenantId: string;
    activeUnitId: string | null;
    permissions: Permission[];
};
const select = `b.id,b.unit_id AS "unitId",b.product_id AS "productId",b.code,p.name AS "productName",p.code AS "productCode",p.base_unit AS "baseUnit",coalesce(b.manufactured_on::text,'') AS "manufacturedOn",b.expires_on::text AS "expiresOn",b.quantity::text,b.blocked,b.version,c.alert_days AS "alertDays",CASE WHEN b.quantity=0 THEN 'empty' WHEN b.blocked THEN 'blocked' WHEN b.expires_on<inventory.lot_today() THEN 'expired' WHEN b.expires_on<=inventory.lot_today()+c.alert_days THEN 'near' ELSE 'valid' END AS status`;
const from = ' FROM inventory.lots b JOIN inventory.products p ON p.tenant_id=b.tenant_id AND p.id=b.product_id JOIN inventory.lot_controls c ON c.tenant_id=b.tenant_id AND c.unit_id=b.unit_id AND c.product_id=b.product_id';
export class LotsService {
    constructor(private readonly auth: AuthService) { }
    private async run<T>(raw: string, fn: (c: PoolClient, ctx: Context) => Promise<T>) {
        try {
            return await this.auth.withModuleAccess(raw, "lots", async (c, ctx) => {
                if (!ctx.permissions.includes('stock.read') || !ctx.permissions.includes('products.read'))
                    throw new ForbiddenException('Seu perfil não permite consultar lotes e perdas.');
                return fn(c, ctx);
            });
        }
        catch (e) {
            const code = (e as {
                code?: string;
            }).code;
            if (code === '23505')
                throw new ConflictException('Lote ou confirmação já registrado. Confira o histórico.');
            if (code === '23514' || code === 'P0801')
                throw new ConflictException('Confira datas, versão, saldo físico não classificado, reservas e quantidade do lote. Para estornar descarte, ele deve ser o último movimento do produto nesta filial.');
            if (code === '42501')
                throw new ForbiddenException('Ação de lote não autorizada nesta filial.');
            if (code === '22003')
                throw new BadRequestException('Quantidade excede o limite do estoque.');
            throw e;
        }
    }
    private async unit(c: PoolClient, ctx: Context) {
        if (!ctx.activeUnitId)
            throw new BadRequestException('Selecione uma filial para consultar lotes.');
        if (!(await c.query("SELECT inventory.allowed($1,'stock.read',$2) AS allowed", [ctx.tenantId, ctx.activeUnitId])).rows[0].allowed)
            throw new NotFoundException('Filial indisponível.');
        return ctx.activeUnitId;
    }
    async overview(raw: string): Promise<LotOverview> {
        return this.run(raw, async (c, ctx) => {
            const unit = ctx.activeUnitId;
            if (unit)
                await this.unit(c, ctx);
            return { unitId: unit, today: (await c.query('SELECT inventory.lot_today()::text AS today')).rows[0].today, canManage: ctx.permissions.includes('stock.manage'), summary: unit ? (await c.query(`SELECT count(*) FILTER(WHERE b.quantity>0)::int AS lots,count(*) FILTER(WHERE b.quantity>0 AND b.expires_on<inventory.lot_today())::int AS expired,count(*) FILTER(WHERE b.quantity>0 AND b.expires_on BETWEEN inventory.lot_today() AND inventory.lot_today()+c.alert_days)::int AS near,count(*) FILTER(WHERE b.quantity>0 AND b.blocked)::int AS blocked,(SELECT count(*)::int FROM inventory.lot_controls x JOIN inventory.levels l ON l.tenant_id=x.tenant_id AND l.unit_id=x.unit_id AND l.product_id=x.product_id WHERE x.tenant_id=$1 AND x.unit_id=$2 AND l.physical>coalesce((SELECT sum(quantity) FROM inventory.lots z WHERE z.tenant_id=x.tenant_id AND z.unit_id=x.unit_id AND z.product_id=x.product_id),0)) AS "unclassifiedProducts" FROM inventory.lots b JOIN inventory.lot_controls c ON c.tenant_id=b.tenant_id AND c.unit_id=b.unit_id AND c.product_id=b.product_id WHERE b.tenant_id=$1 AND b.unit_id=$2`, [ctx.tenantId, unit])).rows[0] : { lots: 0, expired: 0, near: 0, blocked: 0, unclassifiedProducts: 0 } };
        });
    }
    async list(raw: string, f: {
        query: string;
        status: string;
        page: number;
    }) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` WHERE b.tenant_id=$1 AND b.unit_id=$2 AND ($3='' OR position(lower($3) in lower(b.code||' '||p.name||' '||p.code))>0)`, base = 'SELECT ' + select + from + where, values = [ctx.tenantId, unit, f.query]; const wrapped = ` FROM (${base}) x WHERE ($4='all' OR ($4='expired' AND quantity::numeric>0 AND "expiresOn"::date<inventory.lot_today()) OR ($4='near' AND quantity::numeric>0 AND "expiresOn"::date BETWEEN inventory.lot_today() AND inventory.lot_today()+"alertDays") OR ($4 NOT IN('expired','near') AND status=$4))`; return { items: (await c.query('SELECT *' + wrapped + ' ORDER BY "expiresOn",code,id LIMIT 20 OFFSET $5', [...values, f.status, f.page * 20])).rows, total: Number((await c.query('SELECT count(*)' + wrapped, [...values, f.status])).rows[0].count), page: f.page }; }); }
    async products(raw: string, query: string, page: number, low: boolean) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), sql = `SELECT p.id,p.code,p.name,p.base_unit AS "baseUnit",coalesce(l.physical,0)::text AS physical,coalesce(l.reserved,0)::text AS reserved,coalesce(a.q,0)::text AS allocated,(coalesce(l.physical,0)-coalesce(a.q,0))::text AS unallocated,greatest(0,inventory.lot_sellable(p.tenant_id,$2,p.id,coalesce(l.physical,0))-coalesce(l.reserved,0))::text AS sellable,coalesce(s.minimum_stock,p.minimum_stock)::text AS minimum,coalesce(s.ideal_stock,p.ideal_stock)::text AS ideal,greatest(0,coalesce(s.ideal_stock,p.ideal_stock)-greatest(0,inventory.lot_sellable(p.tenant_id,$2,p.id,coalesce(l.physical,0))-coalesce(l.reserved,0)))::text AS suggestion,(c.id IS NOT NULL) AS tracking,coalesce(c.alert_days,30) AS "alertDays",c.version AS "controlVersion" FROM inventory.products p LEFT JOIN inventory.levels l ON l.tenant_id=p.tenant_id AND l.unit_id=$2 AND l.product_id=p.id LEFT JOIN inventory.settings s ON s.tenant_id=p.tenant_id AND s.unit_id=$2 AND s.product_id=p.id LEFT JOIN inventory.lot_controls c ON c.tenant_id=p.tenant_id AND c.unit_id=$2 AND c.product_id=p.id LEFT JOIN LATERAL(SELECT sum(quantity) AS q FROM inventory.lots b WHERE b.tenant_id=p.tenant_id AND b.unit_id=$2 AND b.product_id=p.id) a ON true WHERE p.tenant_id=$1 AND p.active AND ($3='' OR position(lower($3) in lower(p.name||' '||p.code))>0)`, wrapped = ' FROM (' + sql + ') x' + (low ? ' WHERE sellable::numeric<=minimum::numeric' : ''), v = [ctx.tenantId, unit, query]; return { items: (await c.query('SELECT *' + wrapped + ' ORDER BY name,id LIMIT 20 OFFSET $4', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + wrapped, v)).rows[0].count), page }; }); }
    async detail(raw: string, id: string, page: number) {
        return this.run(raw, async (c, ctx) => {
            const unit = await this.unit(c, ctx), lot = (await c.query('SELECT ' + select + from + ' WHERE b.tenant_id=$1 AND b.unit_id=$2 AND b.id=$3', [ctx.tenantId, unit, id])).rows[0];
            if (!lot)
                throw new NotFoundException('Lote não encontrado no acesso autorizado.');
            return { lot, events: (await c.query(`SELECT id,kind,quantity_delta::text AS "quantityDelta",reason,actor_name AS "actorName",created_at AS "createdAt",movement_id AS "movementId",loss_kind AS "lossKind" FROM inventory.lot_events WHERE tenant_id=$1 AND lot_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3`, [ctx.tenantId, id, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM inventory.lot_events WHERE tenant_id=$1 AND lot_id=$2', [ctx.tenantId, id])).rows[0].count), page };
        });
    }
    async losses(raw: string, f: {
        from: string;
        to: string;
        query: string;
        page: number;
    }) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` FROM inventory.movements m JOIN inventory.products p ON p.tenant_id=m.tenant_id AND p.id=m.product_id LEFT JOIN inventory.lots b ON b.tenant_id=m.tenant_id AND b.id=m.lot_id LEFT JOIN inventory.lot_events e ON e.tenant_id=m.tenant_id AND e.movement_id=m.id AND e.kind='loss' WHERE m.tenant_id=$1 AND m.unit_id=$2 AND m.kind='loss' AND (m.created_at AT TIME ZONE 'America/Fortaleza')::date BETWEEN $3::date AND $4::date AND ($5='' OR position(lower($5) in lower(p.name||' '||p.code||' '||coalesce(b.code,'')||' '||m.reason))>0)`, v = [ctx.tenantId, unit, f.from, f.to, f.query], reversed = `EXISTS(SELECT 1 FROM inventory.movements r WHERE r.tenant_id=m.tenant_id AND r.reversal_of=m.id)`; return { items: (await c.query(`SELECT m.id,b.id AS "lotId",b.code AS "lotCode",p.name AS "productName",p.base_unit AS "baseUnit",m.base_quantity::text AS quantity,(-m.value_delta)::text AS "costValue",m.reason,m.actor_name AS "actorName",m.created_at AS "createdAt",${reversed} AS reversed,e.loss_kind AS "lossKind"` + where + ' ORDER BY m.created_at DESC,m.id DESC LIMIT 20 OFFSET $6', [...v, f.page * 20])).rows, summary: (await c.query(`SELECT count(*)::int AS count,coalesce(sum(-m.value_delta),0)::text AS gross,coalesce(sum(-m.value_delta) FILTER(WHERE ${reversed}),0)::text AS reversed,coalesce(sum(-m.value_delta) FILTER(WHERE NOT ${reversed}),0)::text AS net` + where, v)).rows[0], total: Number((await c.query('SELECT count(*)' + where, v)).rows[0].count), page: f.page }; }); }
    async command(raw: string, input: Record<string, unknown>) {
        return this.run(raw, async (c, ctx) => {
            if (!ctx.permissions.includes('stock.manage'))
                throw new ForbiddenException('Seu perfil não permite alterar lotes ou registrar perdas.');
            const unit = await this.unit(c, ctx);
            if (unit !== input.unitId)
                throw new ForbiddenException('Selecione a filial da operação.');
            return { id: (await c.query('SELECT inventory.lot_command($1::jsonb) AS id', [JSON.stringify(input)])).rows[0].id };
        });
    }
}

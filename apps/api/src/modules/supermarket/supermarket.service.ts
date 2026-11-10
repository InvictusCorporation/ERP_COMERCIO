import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Permission } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
type Context = {
    tenantId: string;
    activeUnitId: string | null;
    permissions: Permission[];
};
const sector = 'id,unit_id AS "unitId",name,active,version', scale = 'id,unit_id AS "unitId",name,model,mode,prefix,capacity::text,resolution::text,active,reviewed,version', weighing = 'id,product_id AS "productId",scale_id AS "scaleId",lot_id AS "lotId",gross::text,tare::text,net::text,price::text,total::text,barcode,snapshot,source,actor_name AS "actorName",created_at AS "createdAt"', run = 'id,recipe_id AS "recipeId",recipe_version AS "recipeVersion",status,factor::text,output_product_id AS "outputProductId",expected_quantity::text AS "expectedQuantity",actual_quantity::text AS "actualQuantity",total_cost::text AS "totalCost",input_items AS "inputItems",output_lot_id AS "outputLotId",lot_code AS "lotCode",expires_on::text AS "expiresOn",snapshot,reason,actor_name AS "actorName",created_at AS "createdAt",reversed_at AS "reversedAt",reversed_by AS "reversedBy",reversal_reason AS "reversalReason"';
export class SupermarketService {
    constructor(private readonly auth: AuthService) { }
    private async execute<T>(raw: string, fn: (c: PoolClient, ctx: Context) => Promise<T>) { try {
        return await this.auth.withAccess(raw, async (c, ctx) => { if (!ctx.permissions.includes('stock.read') || !ctx.permissions.includes('products.read'))
            throw new ForbiddenException('Seu perfil não permite consultar setores e produção.'); return fn(c, ctx); });
    }
    catch (e) {
        const code = (e as {
            code?: string;
        }).code;
        if (code === '23505')
            throw new ConflictException('Nome, PLU, lote ou confirmação já registrado. Confira o histórico.');
        if (code === 'P0801')
            throw new ConflictException('Confira saldo classificado, reservas, validade e bloqueio dos lotes.');
        if (code === 'P0901' || code === '23514')
            throw new ConflictException('Confira versões, ficha revisada, setor ativo, peso, estoque e validade. Estorno de produção exige seus movimentos como últimos do produto na filial.');
        if (code === '42501')
            throw new ForbiddenException('Operação não autorizada nesta filial.');
        if (code === '22003')
            throw new BadRequestException('Quantidade ou custo excede o limite permitido.');
        throw e;
    } }
    private async unit(c: PoolClient, ctx: Context) { if (!ctx.activeUnitId)
        throw new BadRequestException('Selecione uma filial para operar setores e produção.'); if (!(await c.query("SELECT inventory.allowed($1,'stock.read',$2) AS allowed", [ctx.tenantId, ctx.activeUnitId])).rows[0].allowed)
        throw new NotFoundException('Filial indisponível.'); return ctx.activeUnitId; }
    async overview(raw: string) { return this.execute(raw, async (c, ctx) => { const unit = ctx.activeUnitId; if (unit)
        await this.unit(c, ctx); return { unitId: unit, today: (await c.query('SELECT inventory.lot_today()::text AS today')).rows[0].today, canManage: ctx.permissions.includes('stock.manage'), summary: unit ? (await c.query(`SELECT (SELECT count(*)::int FROM supermarket.sectors WHERE tenant_id=$1 AND unit_id=$2 AND active) AS sectors,(SELECT count(*)::int FROM supermarket.product_profiles WHERE tenant_id=$1 AND unit_id=$2 AND weighted) AS "weighedProducts",(SELECT count(*)::int FROM supermarket.scales WHERE tenant_id=$1 AND unit_id=$2 AND active) AS scales,(SELECT count(*)::int FROM supermarket.weighings WHERE tenant_id=$1 AND unit_id=$2) AS weighings,(SELECT count(*)::int FROM supermarket.runs WHERE tenant_id=$1 AND unit_id=$2 AND status='confirmed') AS runs`, [ctx.tenantId, unit])).rows[0] : { sectors: 0, weighedProducts: 0, scales: 0, weighings: 0, runs: 0 } }; }); }
    async configs(raw: string, kind: 'sectors' | 'scales') { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx); return { items: (await c.query('SELECT ' + (kind === 'sectors' ? sector : scale) + ' FROM supermarket.' + kind + ' WHERE tenant_id=$1 AND unit_id=$2 ORDER BY active DESC,name,id LIMIT 200', [ctx.tenantId, unit])).rows }; }); }
    async products(raw: string, query: string, page: number, weighted: boolean) { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` FROM inventory.products p LEFT JOIN supermarket.product_profiles x ON x.tenant_id=p.tenant_id AND x.unit_id=$2 AND x.product_id=p.id LEFT JOIN supermarket.sectors s ON s.tenant_id=x.tenant_id AND s.id=x.sector_id WHERE p.tenant_id=$1 AND p.active AND ($3='' OR position(lower($3) in lower(p.name||' '||p.code))>0)` + (weighted ? ' AND x.weighted AND s.active AND p.base_unit=\'KG\'' : ''), v = [ctx.tenantId, unit, query]; return { items: (await c.query(`SELECT p.id,p.code,p.name,p.base_unit AS "baseUnit",p.sale_price::text AS price,EXISTS(SELECT 1 FROM inventory.lot_controls c WHERE c.tenant_id=p.tenant_id AND c.unit_id=$2 AND c.product_id=p.id) AS "lotTracked",CASE WHEN x.id IS NULL THEN NULL ELSE jsonb_build_object('id',x.id,'sectorId',x.sector_id,'sectorName',s.name,'weighted',x.weighted,'plu',x.plu,'version',x.version) END AS profile` + where + ' ORDER BY p.name,p.id LIMIT 20 OFFSET $4', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + where, v)).rows[0].count), page }; }); }
    async lots(raw: string, productId: string) { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx); return { items: (await c.query('SELECT id,code,expires_on::text AS "expiresOn",quantity::text FROM inventory.lots WHERE tenant_id=$1 AND unit_id=$2 AND product_id=$3 AND quantity>0 AND NOT blocked AND expires_on>=inventory.lot_today() ORDER BY expires_on,created_at,id LIMIT 200', [ctx.tenantId, unit, productId])).rows }; }); }
    async recipes(raw: string, query: string, page: number) { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` FROM supermarket.recipes r JOIN inventory.products p ON p.tenant_id=r.tenant_id AND p.id=r.output_product_id WHERE r.tenant_id=$1 AND r.unit_id=$2 AND ($3='' OR position(lower($3) in lower(r.name||' '||p.name))>0)`, v = [ctx.tenantId, unit, query]; return { items: (await c.query(`SELECT r.id,r.sector_id AS "sectorId",r.name,r.output_product_id AS "outputProductId",p.name AS "outputName",p.base_unit AS "outputUnit",r.yield_quantity::text AS "yieldQuantity",r.ingredients,r.notes,r.active,r.reviewed,r.version` + where + ' ORDER BY r.active DESC,r.name,r.id LIMIT 20 OFFSET $4', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + where, v)).rows[0].count), page }; }); }
    async records(raw: string, kind: 'weighings' | 'runs', query: string, page: number) { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` FROM supermarket.${kind} WHERE tenant_id=$1 AND unit_id=$2 AND ($3='' OR position(lower($3) in lower(snapshot::text))>0)`, v = [ctx.tenantId, unit, query]; return { items: (await c.query('SELECT ' + (kind === 'weighings' ? weighing : run) + where + ' ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $4', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + where, v)).rows[0].count), page }; }); }
    async detail(raw: string, kind: 'weighings' | 'runs', id: string) { return this.execute(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), row = (await c.query('SELECT ' + (kind === 'weighings' ? weighing : run) + ' FROM supermarket.' + kind + ' WHERE tenant_id=$1 AND unit_id=$2 AND id=$3', [ctx.tenantId, unit, id])).rows[0]; if (!row)
        throw new NotFoundException('Registro não encontrado na filial autorizada.'); return row; }); }
    async write(raw: string, kind: 'sector' | 'product' | 'scale' | 'weigh' | 'recipe' | 'run' | 'reverse', input: Record<string, unknown>) { return this.execute(raw, async (c, ctx) => { if (!ctx.permissions.includes('stock.manage'))
        throw new ForbiddenException('Seu perfil não permite configurar ou confirmar produção e pesagem.'); const unit = await this.unit(c, ctx); if (kind !== 'reverse' && input.unitId !== unit)
        throw new ForbiddenException('Selecione a filial da operação.'); if (kind === 'reverse' && !(await c.query('SELECT 1 FROM supermarket.runs WHERE tenant_id=$1 AND unit_id=$2 AND id=$3', [ctx.tenantId, unit, input.id])).rowCount)
        throw new NotFoundException('Produção não encontrada.'); const fn = ['sector', 'product', 'scale'].includes(kind) ? 'save_config' : ({ weigh: 'weigh', recipe: 'save_recipe', run: 'confirm_run', reverse: 'reverse_run' } as Record<string, string>)[kind]; const r = await c.query('SELECT supermarket.' + fn + '($1::jsonb' + (['sector', 'product', 'scale'].includes(kind) ? ',$2' : '') + ') AS id', [JSON.stringify(input), ...(['sector', 'product', 'scale'].includes(kind) ? [kind] : [])]); return { id: r.rows[0].id }; }); }
}

import { ForbiddenException, NotFoundException, ConflictException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Permission, PosOverview, SalePage, SaleDetail, RegisterDetail } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
import type { AuthConfig } from '../identity/auth-config';
export function sandboxEnabled(config: Pick<AuthConfig, 'origin' | 'posSandbox'>, env = process.env.NODE_ENV) { if (env === 'production')
    return false; return config.posSandbox ?? ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.origin).hostname); }
const saleSelect = `id,number,unit_id AS "unitId",register_id AS "registerId",operator_id AS "operatorId",operator_name AS "operatorName",unit_snapshot AS unit,items,gross::text,discount::text,total::text,status,version,current_payment_id AS "paymentId",notes,reason,created_at AS "createdAt",confirmed_at AS "confirmedAt",returned_at AS "returnedAt",returned_by AS "returnedBy",sandbox`;
const registerSelect = `id,unit_id AS "unitId",code,operator_id AS "operatorId",operator_name AS "operatorName",opening_amount::text AS "openingAmount",opened_at AS "openedAt",closed_at AS "closedAt",closed_by AS "closedBy",counted::text,expected::text,difference::text,notes,pos.cash_balance(tenant_id,id)::text AS balance`;
type Context = {
    permissions: Permission[];
    tenantId: string;
    userId: string;
    activeUnitId: string | null;
};
export class PosService {
    constructor(private readonly auth: AuthService) { }
    private require(ctx: Context, p: Permission) { if (!ctx.permissions.includes(p))
        throw new ForbiddenException('Você não tem permissão para esta ação.'); }
    private async run<T>(raw: string, fn: (c: PoolClient, ctx: Context) => Promise<T>) { if (!sandboxEnabled(this.auth.config))
        throw new ServiceUnavailableException('PDV disponível somente no ambiente de teste. Pagamentos reais aguardam integração e homologação.'); try {
        return await this.auth.withAccess(raw, async (c, ctx) => { this.require(ctx, 'pos.read'); await c.query("SELECT set_config('app.pos_sandbox','true',true)"); return fn(c, ctx); });
    }
    catch (e) {
        const code = (e as {
            code?: string;
        }).code;
        if(code==='P0701')throw new ConflictException('Regularize ou cancele o documento fiscal antes de registrar a devolução da venda.');
        if (code === 'P0801') throw new ConflictException('Controle de lotes: confira classificação, validade, bloqueio e reservas. Regularize os lotes antes de vender ou estornar a entrada.');
        if (code === '23505')
            throw new ConflictException('Caixa, operação ou confirmação já registrada. Atualize a consulta.');
        if (code === '23514')
            throw new ConflictException('Operação fora de sequência. Confira caixa aberto, preço atual, saldo, pagamentos, troco e versão da venda.');
        if (code === '42501')
            throw new ForbiddenException('Operador ou unidade não autorizado para esta ação.');
        if (code === '22003')
            throw new BadRequestException('Quantidade ou valor excede o limite permitido.');
        throw e;
    } }
    private async unit(c: PoolClient, ctx: Context, id: string | null) { if (!id)
        throw new BadRequestException('Selecione uma unidade para operar o PDV.'); if (!(await c.query("SELECT inventory.allowed($1,'pos.read',$2) AS allowed", [ctx.tenantId, id])).rows[0].allowed)
        throw new NotFoundException('Unidade não encontrada no acesso autorizado.'); return id; }
    async overview(raw: string, unitId?: string): Promise<PosOverview> { return this.run(raw, async (c, ctx) => { const unit = unitId || ctx.activeUnitId; const units = (await c.query("SELECT id,name FROM organizations.units WHERE tenant_id=$1 AND inventory.allowed(tenant_id,'pos.read',id) ORDER BY name", [ctx.tenantId])).rows; if (unit)
        await this.unit(c, ctx, unit); return { mode: 'sandbox', unitId: unit, units, registers: unit ? (await c.query('SELECT ' + registerSelect + ' FROM pos.registers WHERE tenant_id=$1 AND unit_id=$2 ORDER BY closed_at NULLS FIRST,opened_at DESC,id DESC LIMIT 40', [ctx.tenantId, unit])).rows : [], activeRegister: unit ? (await c.query('SELECT ' + registerSelect + ' FROM pos.registers WHERE tenant_id=$1 AND unit_id=$2 AND operator_id=$3 AND closed_at IS NULL', [ctx.tenantId, unit, ctx.userId])).rows[0] || null : null, capabilities: { sell: ctx.permissions.includes('pos.sell'), cash: ctx.permissions.includes('pos.cash'), manageCash: ctx.permissions.includes('pos.cash.manage'), discount: ctx.permissions.includes('pos.discount'), refund: ctx.permissions.includes('pos.refund') }, summary: unit ? (await c.query(`SELECT count(*) FILTER(WHERE status='confirmed' AND confirmed_at>=date_trunc('day',now() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza')::int AS confirmed,count(*) FILTER(WHERE status='pending')::int AS pending,coalesce(sum(total) FILTER(WHERE status='confirmed' AND confirmed_at>=date_trunc('day',now() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'),0)::text AS total,coalesce(sum(total) FILTER(WHERE status='returned' AND returned_at>=date_trunc('day',now() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'),0)::text AS returned FROM pos.sales WHERE tenant_id=$1 AND unit_id=$2`, [ctx.tenantId, unit])).rows[0] : { confirmed: 0, pending: 0, total: '0', returned: '0' } }; }); }
    async catalog(raw: string, unitId: string | undefined, query: string, barcode: string, page: number) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx, unitId || ctx.activeUnitId); const r = (await c.query(`SELECT id,code,name,base_unit AS "baseUnit",category,price::text,available::text,barcodes,total_count AS total FROM pos.catalog($1,$2,$3,$4)`, [unit, query, barcode, page])).rows; return { items: r.map(({ total, ...p }) => p), total: Number(r[0]?.total || 0), page }; }); }
    async sales(raw: string, filter: {
        unitId?: string;
        query: string;
        status: string;
        page: number;
    }): Promise<SalePage> { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx, filter.unitId || ctx.activeUnitId); const where = ` WHERE tenant_id=$1 AND unit_id=$2 AND ($3='' OR position(lower($3) in lower(number||' '||operator_name))>0) AND ($4='all' OR status=$4)`; const values = [ctx.tenantId, unit, filter.query, filter.status]; return { items: (await c.query('SELECT ' + saleSelect + ' FROM pos.sales' + where + ' ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $5', [...values, filter.page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM pos.sales' + where, values)).rows[0].count), page: filter.page }; }); }
    async detail(raw: string, id: string): Promise<SaleDetail> { return this.run(raw, async (c, ctx) => { const sale = (await c.query('SELECT ' + saleSelect + ' FROM pos.sales WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0]; if (!sale)
        throw new NotFoundException('Venda não encontrada no acesso autorizado.'); return { sale, lotAllocations:(await c.query("SELECT inventory.sale_lots($1) AS lots",[id])).rows[0].lots, payments: (await c.query(`SELECT id,state,methods,cash_amount::text AS "cashAmount",change_amount::text AS "changeAmount",total::text,provider,created_at AS "createdAt" FROM pos.payments WHERE tenant_id=$1 AND sale_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100`, [ctx.tenantId, id])).rows }; }); }
    async registers(raw: string, unitId: string | undefined, page: number) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx, unitId || ctx.activeUnitId); return { items: (await c.query('SELECT ' + registerSelect + ' FROM pos.registers WHERE tenant_id=$1 AND unit_id=$2 ORDER BY opened_at DESC,id DESC LIMIT 20 OFFSET $3', [ctx.tenantId, unit, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM pos.registers WHERE tenant_id=$1 AND unit_id=$2', [ctx.tenantId, unit])).rows[0].count), page }; }); }
    async register(raw: string, id: string, page: number): Promise<RegisterDetail> { return this.run(raw, async (c, ctx) => { const register = (await c.query('SELECT ' + registerSelect + ' FROM pos.registers WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0]; if (!register)
        throw new NotFoundException('Caixa não encontrado no acesso autorizado.'); return { register, entries: (await c.query(`SELECT id,kind,amount::text,reason,actor_name AS "actorName",created_at AS "createdAt" FROM pos.cash_entries WHERE tenant_id=$1 AND register_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3`, [ctx.tenantId, id, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM pos.cash_entries WHERE tenant_id=$1 AND register_id=$2', [ctx.tenantId, id])).rows[0].count), page }; }); }
    async mutate(raw: string, operation: 'open' | 'adjust' | 'close' | 'save' | 'payment' | 'settle' | 'cancel' | 'return', input: Record<string, unknown>) { return this.run(raw, async (c, ctx) => { const permission: Permission = operation === 'adjust' ? 'pos.cash.manage' : ['open', 'close'].includes(operation) ? 'pos.cash' : operation === 'return' ? 'pos.refund' : 'pos.sell'; this.require(ctx, permission); let r; switch (operation) {
        case 'open':
            r = await c.query('SELECT pos.open_register($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
        case 'adjust':
            r = await c.query('SELECT pos.adjust_cash($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
        case 'close':
            r = await c.query('SELECT pos.close_register($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
        case 'save':
            r = await c.query('SELECT pos.save_sale($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
        case 'payment':
            r = await c.query('SELECT pos.begin_payment($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
        case 'settle':
            r = await c.query('SELECT pos.settle_payment($1,$2) AS id', [input.paymentId, input.outcome]);
            break;
        case 'cancel':
            r = await c.query('SELECT pos.cancel_sale($1,$2,$3) AS id', [input.saleId, input.version, input.reason]);
            break;
        case 'return':
            r = await c.query('SELECT pos.return_sale($1::jsonb) AS id', [JSON.stringify(input)]);
            break;
    } return { ok: true, id: r.rows[0].id, mode: 'sandbox' }; }); }
}

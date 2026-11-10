import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Permission, FinanceOverview } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
const A = `a.id,a.unit_id AS "unitId",a.name,a.kind,a.opening_date::text AS "openingDate",a.opening_amount::text AS "openingAmount",a.balance::text,a.closed_through::text AS "closedThrough",a.active,a.version`;
const status = `CASE WHEN t.cancelled THEN 'cancelled' WHEN t.paid=t.amount THEN 'paid' WHEN t.due_date<finance.today() THEN 'overdue' WHEN t.paid>0 THEN 'partial' ELSE 'open' END`;
const T = `t.id,t.unit_id AS "unitId",t.number,t.kind,t.counterparty,t.description,t.category,t.reference,t.notes,t.issue_date::text AS "issueDate",t.due_date::text AS "dueDate",t.amount::text,t.paid::text,(t.amount-t.paid)::text AS remaining,t.cancelled,t.cancel_reason AS "cancelReason",t.installment,t.installments,t.version,t.purchase_receipt_id AS "purchaseReceiptId",t.source_snapshot AS "sourceSnapshot",` + status + ` AS status`;
const C = `id,account_id AS "accountId",through_date::text AS "throughDate",expected::text,counted::text,difference::text,notes,actor_name AS "actorName",reopened_at AS "reopenedAt",reopened_by AS "reopenedBy",reopen_reason AS "reopenReason"`;
type Context = {
    permissions: Permission[];
    tenantId: string;
    userId: string;
    activeUnitId: string | null;
};
export class FinanceService {
    constructor(private readonly auth: AuthService) {
    }
    private require(ctx: Context, p: Permission) {
        if (!ctx.permissions.includes(p))
            throw new ForbiddenException('Você não tem permissão para esta ação financeira.');
    }
    private async run<T>(raw: string, fn: (c: PoolClient, ctx: Context) => Promise<T>) {
        try {
            return await this.auth.withAccess(raw, async (c, ctx) => {
                this.require(ctx, 'finance.read');
                return fn(c, ctx);
            });
        }
        catch (e) {
            const code = (e as {
                code?: string;
            }).code;
            if (code === '23505')
                throw new ConflictException('Nome, origem ou confirmação já registrada. Atualize a consulta.');
            if (code === '23514' || code === 'P1101')
                throw new ConflictException('Operação financeira recusada. Confira saldo, principal pendente, versão, datas, conta ativa e período aberto.');
            if (code === '42501')
                throw new ForbiddenException('Unidade ou operação financeira não autorizada.');
            if (code === '22003' || code === '22008')
                throw new BadRequestException('Valor ou data excede o limite permitido.');
            throw e;
        }
    }
    private async unit(c: PoolClient, ctx: Context, id?: string) {
        const unit = id || ctx.activeUnitId;
        if (!unit)
            throw new BadRequestException('Selecione uma filial para consultar o financeiro.');
        if (!(await c.query("SELECT inventory.allowed($1,'finance.read',$2) AS allowed", [ctx.tenantId, unit])).rows[0].allowed)
            throw new NotFoundException('Unidade indisponível no acesso autorizado.');
        return unit;
    }
    async overview(raw: string): Promise<FinanceOverview> {
        return this.run(raw, async (c, ctx) => {
            const unit = ctx.activeUnitId;
            if (unit)
                await this.unit(c, ctx);
            const summary = unit ? (await c.query(`SELECT coalesce(sum(amount-paid) FILTER(WHERE kind='payable' AND NOT cancelled),0)::text AS payable,coalesce(sum(amount-paid) FILTER(WHERE kind='receivable' AND NOT cancelled),0)::text AS receivable,coalesce(sum(amount-paid) FILTER(WHERE kind='payable' AND NOT cancelled AND due_date<finance.today()),0)::text AS "overduePayable",coalesce(sum(amount-paid) FILTER(WHERE kind='receivable' AND NOT cancelled AND due_date<finance.today()),0)::text AS "overdueReceivable",(SELECT coalesce(sum(balance),0)::text FROM finance.accounts WHERE tenant_id=$1 AND unit_id=$2) AS balance FROM finance.titles WHERE tenant_id=$1 AND unit_id=$2`, [ctx.tenantId, unit])).rows[0] : {
                payable: '0', receivable: '0', overduePayable: '0', overdueReceivable: '0', balance: '0'
            };
            return {
                unitId: unit, today: (await c.query('SELECT finance.today()::text AS today')).rows[0].today, accounts: unit ? (await c.query('SELECT ' + A + ' FROM finance.accounts a WHERE tenant_id=$1 AND unit_id=$2 AND active ORDER BY name LIMIT 100', [ctx.tenantId, unit])).rows : [], capabilities: {
                    manage: ctx.permissions.includes('finance.manage'), settle: ctx.permissions.includes('finance.settle'), reverse: ctx.permissions.includes('finance.reverse'), cash: ctx.permissions.includes('finance.cash'), purchases: ctx.permissions.includes('purchases.read'), pos: ctx.permissions.includes('pos.read')
                }, summary
            };
        });
    }
    async titles(raw: string, f: {
        kind: string;
        status: string;
        query: string;
        page: number;
        from: string;
        to: string;
    }) {
        return this.run(raw, async (c, ctx) => {
            const unit = await this.unit(c, ctx), where = ` WHERE t.tenant_id=$1 AND t.unit_id=$2 AND t.kind=$3 AND ($4='all' OR (` + status + `)=$4) AND ($5='' OR position(lower($5) in lower(t.number||' '||t.counterparty||' '||t.description||' '||t.reference))>0) AND ($6='' OR t.due_date>=nullif($6,'')::date) AND ($7='' OR t.due_date<=nullif($7,'')::date)`, values = [ctx.tenantId, unit, f.kind, f.status, f.query, f.from, f.to];
            return {
                items: (await c.query('SELECT ' + T + ' FROM finance.titles t' + where + ' ORDER BY due_date,created_at DESC,id LIMIT 20 OFFSET $8', [...values, f.page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM finance.titles t' + where, values)).rows[0].count), page: f.page
            };
        });
    }
    async title(raw: string, id: string) {
        return this.run(raw, async (c, ctx) => {
            const title = (await c.query('SELECT ' + T + ' FROM finance.titles t WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0];
            if (!title)
                throw new NotFoundException('Título não encontrado no acesso autorizado.');
            return {
                title, settlements: (await c.query(`SELECT s.id,s.account_id AS "accountId",a.name AS "accountName",s.principal::text,s.interest::text,s.fee::text,s.discount::text,s.cash_amount::text AS "cashAmount",s.posted_date::text AS "postedDate",s.method,s.reference,s.notes,s.actor_name AS "actorName",s.reversed_at AS "reversedAt",s.reversed_by AS "reversedBy",s.reversal_reason AS "reversalReason" FROM finance.settlements s JOIN finance.accounts a ON a.tenant_id=s.tenant_id AND a.id=s.account_id WHERE s.tenant_id=$1 AND s.title_id=$2 ORDER BY s.created_at DESC,s.id LIMIT 500`, [ctx.tenantId, id])).rows
            };
        });
    }
    async accounts(raw: string, page: number) {
        return this.run(raw, async (c, ctx) => {
            const unit = await this.unit(c, ctx);
            return {
                items: (await c.query('SELECT ' + A + ' FROM finance.accounts a WHERE tenant_id=$1 AND unit_id=$2 ORDER BY active DESC,name,id LIMIT 20 OFFSET $3', [ctx.tenantId, unit, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM finance.accounts WHERE tenant_id=$1 AND unit_id=$2', [ctx.tenantId, unit])).rows[0].count), page
            };
        });
    }
    async account(raw: string, id: string, page: number) {
        return this.run(raw, async (c, ctx) => {
            const account = (await c.query('SELECT ' + A + ' FROM finance.accounts a WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0];
            if (!account)
                throw new NotFoundException('Conta não encontrada no acesso autorizado.');
            return {
                account, closings: (await c.query('SELECT ' + C + ' FROM finance.closings WHERE tenant_id=$1 AND account_id=$2 ORDER BY through_date DESC,created_at DESC,id LIMIT 20 OFFSET $3', [ctx.tenantId, id, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM finance.closings WHERE tenant_id=$1 AND account_id=$2', [ctx.tenantId, id])).rows[0].count), page
            };
        });
    }
    async entries(raw: string, f: {
        accountId: string | null;
        from: string;
        to: string;
        page: number;
    }) {
        return this.run(raw, async (c, ctx) => {
            const unit = await this.unit(c, ctx), where = ` WHERE e.tenant_id=$1 AND e.unit_id=$2 AND ($3::uuid IS NULL OR e.account_id=$3) AND e.posted_date BETWEEN $4::date AND $5::date`, values = [ctx.tenantId, unit, f.accountId, f.from, f.to];
            return {
                items: (await c.query(`SELECT e.id,e.account_id AS "accountId",a.name AS "accountName",s.title_id AS "titleId",e.settlement_id AS "settlementId",e.transfer_id AS "transferId",e.reversal_of AS "reversalOf",e.kind,e.amount::text,e.balance_after::text AS "balanceAfter",e.posted_date::text AS "postedDate",e.description,e.actor_name AS "actorName",e.created_at AS "createdAt" FROM finance.entries e JOIN finance.accounts a ON a.tenant_id=e.tenant_id AND a.id=e.account_id LEFT JOIN finance.settlements s ON s.tenant_id=e.tenant_id AND s.id=e.settlement_id` + where + ' ORDER BY e.posted_date DESC,e.created_at DESC,e.id LIMIT 20 OFFSET $6', [...values, f.page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM finance.entries e' + where, values)).rows[0].count), page: f.page
            };
        });
    }
    async flow(raw: string, f: {
        accountId: string | null;
        from: string;
        to: string;
    }) {
        return this.run(raw, async (c, ctx) => {
            const unit = await this.unit(c, ctx), values = [ctx.tenantId, unit, f.accountId, f.from, f.to], where = ` FROM finance.entries WHERE tenant_id=$1 AND unit_id=$2 AND ($3::uuid IS NULL OR account_id=$3)`;
            const s = (await c.query(`SELECT coalesce(sum(amount) FILTER(WHERE posted_date<$4::date),0)::text AS opening,coalesce(sum(amount) FILTER(WHERE posted_date BETWEEN $4::date AND $5::date AND amount>0),0)::text AS inflows,coalesce(-sum(amount) FILTER(WHERE posted_date BETWEEN $4::date AND $5::date AND amount<0),0)::text AS outflows,coalesce(sum(amount) FILTER(WHERE posted_date<=$5::date),0)::text AS ending,coalesce(sum(amount) FILTER(WHERE posted_date BETWEEN $4::date AND $5::date AND kind IN('settlement','reversal') AND settlement_id IN(SELECT s.id FROM finance.settlements s JOIN finance.titles t ON t.tenant_id=s.tenant_id AND t.id=s.title_id WHERE t.kind='receivable')),0)::text AS "operatingIn",coalesce(-sum(amount) FILTER(WHERE posted_date BETWEEN $4::date AND $5::date AND kind IN('settlement','reversal') AND settlement_id IN(SELECT s.id FROM finance.settlements s JOIN finance.titles t ON t.tenant_id=s.tenant_id AND t.id=s.title_id WHERE t.kind='payable')),0)::text AS "operatingOut"` + where, values)).rows[0];
            return {
                ...s, from: f.from, to: f.to, days: (await c.query(`SELECT posted_date::text AS date,coalesce(sum(amount) FILTER(WHERE amount>0),0)::text AS inflow,coalesce(-sum(amount) FILTER(WHERE amount<0),0)::text AS outflow` + where + ' AND posted_date BETWEEN $4::date AND $5::date GROUP BY posted_date ORDER BY posted_date', values)).rows
            };
        });
    }
    async sources(raw: string, page: number) {
        return this.run(raw, async (c, ctx) => {
            this.require(ctx, 'purchases.read');
            const unit = await this.unit(c, ctx), where = ` WHERE r.tenant_id=$1 AND r.unit_id=$2 AND r.status='confirmed' AND round(r.total,2)>0 AND NOT EXISTS(SELECT 1 FROM finance.titles t WHERE t.tenant_id=r.tenant_id AND t.purchase_receipt_id=r.id)`;
            return {
                items: (await c.query(`SELECT r.id,r.document,o.number,o.supplier_snapshot->>'name' AS supplier,round(r.total,2)::text AS amount,(r.created_at AT TIME ZONE 'America/Fortaleza')::date::text AS "issueDate" FROM purchasing.receipts r JOIN purchasing.orders o ON o.tenant_id=r.tenant_id AND o.id=r.order_id` + where + ' ORDER BY r.created_at DESC,r.id LIMIT 20 OFFSET $3', [ctx.tenantId, unit, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM purchasing.receipts r' + where, [ctx.tenantId, unit])).rows[0].count), page
            };
        });
    }
    async mutate(raw: string, op: 'account' | 'title' | 'change' | 'cancel' | 'settle' | 'reverse' | 'cash' | 'close' | 'reopen' | 'import', input: Record<string, unknown>) {
        return this.run(raw, async (c, ctx) => {
            const p: Permission = op === 'settle' ? 'finance.settle' : ['reverse', 'reopen'].includes(op) ? 'finance.reverse' : ['cash', 'close'].includes(op) ? 'finance.cash' : 'finance.manage';
            this.require(ctx, p);
            const fn = {
                account: 'save_account', title: 'create_titles', change: 'change_title', cancel: 'cancel_title', settle: 'settle', reverse: 'reverse_settlement', cash: 'cash_operation', close: 'close_account', reopen: 'reopen_account', import: 'import_receipt'
            }[op];
            return {
                ok: true, id: (await c.query('SELECT finance.' + fn + '($1::jsonb) AS id', [JSON.stringify(input)])).rows[0].id
            };
        });
    }
}

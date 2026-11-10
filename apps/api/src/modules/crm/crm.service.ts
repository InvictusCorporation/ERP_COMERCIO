import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Permission } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
type Context = {
    tenantId: string;
    activeUnitId: string | null;
    permissions: Permission[];
};
const customer = 'c.id,c.unit_id AS "unitId",c.code,c.name,c.document,c.phone,c.email,c.address,c.notes,c.active,c.loyalty_opt_in AS "loyaltyOptIn",c.version,c.created_at AS "createdAt"';
const order = `o.id,o.unit_id AS "unitId",o.number,o.customer_id AS "customerId",o.customer_snapshot AS customer,o.address,o.channel,o.mode,o.payment,o.status,CASE WHEN inventory.allowed(o.tenant_id,'stock.read',o.unit_id) THEN o.items ELSE (SELECT jsonb_agg(x-'cost') FROM jsonb_array_elements(o.items) x) END AS items,o.gross::text,o.delivery_fee::text AS "deliveryFee",o.total::text,o.due_date::text AS "dueDate",o.installments,o.interval_days AS "intervalDays",o.version,o.reason,o.notes,o.actor_name AS "actorName",o.created_at AS "createdAt",o.fulfilled_at AS "fulfilledAt",o.returned_at AS "returnedAt",jsonb_build_object('manage',inventory.allowed(o.tenant_id,'orders.manage',o.unit_id),'stock',inventory.allowed(o.tenant_id,'stock.manage',o.unit_id),'finance',inventory.allowed(o.tenant_id,'finance.manage',o.unit_id),'settle',inventory.allowed(o.tenant_id,'finance.settle',o.unit_id)) AS capabilities`;
const delivery = 'd.id,d.unit_id AS "unitId",d.order_id AS "orderId",o.number,o.customer_snapshot AS customer,o.address,d.status,o.status AS "orderStatus",d.courier,d.recipient,d.scheduled_on::text AS "scheduledOn",d.version,d.history,d.created_at AS "createdAt"';
export class CrmService {
    constructor(private readonly auth: AuthService) { }
    private async run<T>(raw: string, fn: (c: PoolClient, x: Context) => Promise<T>) { try {
        return await this.auth.withAccess(raw, async (c, x) => { if (!x.permissions.includes('crm.read') || !x.activeUnitId || !(await c.query("SELECT inventory.allowed($1,'crm.read',$2) yes", [x.tenantId, x.activeUnitId])).rows[0].yes)
            throw new ForbiddenException('Selecione uma filial autorizada para consultar clientes.'); return fn(c, x); });
    }
    catch (e) {
        const code = (e as {
            code?: string;
        }).code;
        if (['P1101', 'P0801', '23514', '23505'].includes(code || ''))
            throw new ConflictException('Operação recusada. Confira versão, sequência, preço, reservas, lotes, limite, vencimentos e baixas financeiras.');
        if (code === '42501')
            throw new ForbiddenException('Operação não autorizada nesta filial.');
        if (['22003', '22008', '23502'].includes(code || ''))
            throw new BadRequestException('Confira os valores e campos obrigatórios.');
        throw e;
    } }
    async overview(raw: string) { return this.run(raw, async (c, x) => { const v = [x.tenantId, x.activeUnitId]; const summary = (await c.query(`SELECT (SELECT count(*)::int FROM crm.customers WHERE tenant_id=$1 AND unit_id=$2 AND active) customers,(SELECT count(*)::int FROM crm.orders WHERE tenant_id=$1 AND unit_id=$2 AND status NOT IN('fulfilled','returned','cancelled')) orders,(SELECT count(*)::int FROM crm.orders WHERE tenant_id=$1 AND unit_id=$2 AND status IN('reserved','ready')) reserved,(SELECT count(*)::int FROM crm.deliveries WHERE tenant_id=$1 AND unit_id=$2 AND status NOT IN('delivered','cancelled')) deliveries`, v)).rows[0]; summary.credit = null; return { unitId: x.activeUnitId, today: (await c.query('SELECT finance.today()::text today')).rows[0].today, canManage: x.permissions.includes('crm.manage'), canCredit: x.permissions.includes('crm.credit'), canLoyalty: x.permissions.includes('crm.loyalty'), canOrders: x.permissions.includes('orders.manage'), canDeliver: x.permissions.includes('deliveries.manage'), summary, program: (await c.query('SELECT id,cents_per_point AS "centsPerPoint",active,version FROM crm.loyalty_programs WHERE tenant_id=$1 AND unit_id=$2', v)).rows[0] || null }; }); }
    async list(raw: string, kind: 'customers' | 'orders' | 'deliveries' | 'loyalty', query: string, page: number, customerId?: string) {
        return this.run(raw, async (c, x) => {
            if (['orders', 'deliveries'].includes(kind) && !x.permissions.includes('orders.read'))
                throw new ForbiddenException('Consulta de pedidos não autorizada.');
            const v = [x.tenantId, x.activeUnitId, query, customerId || null];
            let from, select, where, sort;
            if (kind === 'customers') {
                select = customer;
                from = ' FROM crm.customers c';
                where = ` WHERE c.tenant_id=$1 AND c.unit_id=$2 AND ($3='' OR position(lower($3) in lower(c.name||' '||c.code||' '||c.document))>0) AND ($4::uuid IS NULL OR c.id=$4)`;
                sort = 'c.created_at DESC,c.id';
            }
            else if (kind === 'orders') {
                select = order;
                from = ' FROM crm.orders o';
                where = ` WHERE o.tenant_id=$1 AND o.unit_id=$2 AND ($3='' OR position(lower($3) in lower(o.number||' '||(o.customer_snapshot->>'name')))>0) AND ($4::uuid IS NULL OR o.customer_id=$4)`;
                sort = 'o.created_at DESC,o.id';
            }
            else if (kind === 'deliveries') {
                select = delivery;
                from = ' FROM crm.deliveries d JOIN crm.orders o ON o.tenant_id=d.tenant_id AND o.id=d.order_id';
                where = ` WHERE d.tenant_id=$1 AND d.unit_id=$2 AND ($3='' OR position(lower($3) in lower(o.number||' '||(o.customer_snapshot->>'name')||' '||d.courier))>0) AND ($4::uuid IS NULL OR o.customer_id=$4)`;
                sort = 'd.created_at DESC,d.id';
            }
            else {
                select = 'e.id,e.customer_id AS "customerId",c.name AS "customerName",e.kind,e.points::text,e.reason,e.actor_name AS "actorName",e.created_at AS "createdAt",e.order_id AS "orderId"';
                from = ' FROM crm.loyalty_events e JOIN crm.customers c ON c.tenant_id=e.tenant_id AND c.id=e.customer_id';
                where = ` WHERE e.tenant_id=$1 AND e.unit_id=$2 AND ($3='' OR position(lower($3) in lower(c.name))>0) AND ($4::uuid IS NULL OR e.customer_id=$4)`;
                sort = 'e.created_at DESC,e.id';
            }
            return { items: (await c.query('SELECT ' + select + from + where + ' ORDER BY ' + sort + ' LIMIT 20 OFFSET $5', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + from + where, v)).rows[0].count), page };
        });
    }
    async detail(raw: string, kind: 'customers' | 'orders' | 'deliveries', id: string) {
        return this.run(raw, async (c, x) => {
            const v = [x.tenantId, x.activeUnitId, id];
            if (kind === 'customers') {
                const result = (await c.query('SELECT ' + customer + ' FROM crm.customers c WHERE c.tenant_id=$1 AND c.unit_id=$2 AND c.id=$3', v)).rows[0];
                if (!result)
                    throw new NotFoundException('Cliente não encontrado nesta filial.');
                return { customer: result, credit: (await c.query('SELECT crm.credit_view($1) credit', [id])).rows[0].credit, points: (await c.query('SELECT coalesce(sum(points),0)::text points FROM crm.loyalty_events WHERE tenant_id=$1 AND unit_id=$2 AND customer_id=$3', v)).rows[0].points, canCredit: x.permissions.includes('crm.credit') };
            }
            if (!x.permissions.includes('orders.read'))
                throw new ForbiddenException('Consulta de pedidos não autorizada.');
            const result = (await c.query('SELECT ' + (kind === 'orders' ? order : delivery) + (kind === 'orders' ? ' FROM crm.orders o WHERE o.tenant_id=$1 AND o.unit_id=$2 AND o.id=$3' : ' FROM crm.deliveries d JOIN crm.orders o ON o.tenant_id=d.tenant_id AND o.id=d.order_id WHERE d.tenant_id=$1 AND d.unit_id=$2 AND d.id=$3'), v)).rows[0];
            if (!result)
                throw new NotFoundException('Registro não encontrado nesta filial.');
            if (kind === 'orders')
                result.titles = x.permissions.includes('finance.read') ? (await c.query('SELECT id,number,amount::text,paid::text,due_date::text AS "dueDate",cancelled,installment,installments FROM finance.titles WHERE tenant_id=$1 AND unit_id=$2 AND customer_order_id=$3 ORDER BY installment', v)).rows : [];
            return result;
        });
    }
    async history(raw: string, id: string, page: number) { return this.run(raw, async (c, x) => { if (!(await c.query('SELECT id FROM crm.customers WHERE tenant_id=$1 AND unit_id=$2 AND id=$3', [x.tenantId, x.activeUnitId, id])).rowCount)
        throw new NotFoundException('Cliente indisponível.'); await c.query("SELECT set_config('app.pos_sandbox','true',true)"); const v = [x.tenantId, x.activeUnitId, id]; const from = ` FROM (SELECT id,number,status,total::text,created_at,'manual' AS source FROM crm.orders WHERE tenant_id=$1 AND unit_id=$2 AND customer_id=$3 UNION ALL SELECT id,number,status,total::text,created_at,'sandbox' AS source FROM pos.sales WHERE tenant_id=$1 AND unit_id=$2 AND customer_id=$3) h`; return { items: (await c.query('SELECT id,number,status,total,created_at AS "createdAt",source' + from + ' ORDER BY created_at DESC,id LIMIT 20 OFFSET $4', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + from, v)).rows[0].count), page }; }); }
    async products(raw: string, query: string, page: number) { return this.run(raw, async (c, x) => { if (!x.permissions.includes('orders.read'))
        throw new ForbiddenException('Produtos não autorizados.'); const from = ` FROM inventory.products p WHERE p.tenant_id=$1 AND p.active AND p.sale_price>0 AND ($2='' OR position(lower($2) in lower(p.name||' '||p.code))>0)`; const v = [x.tenantId, query]; return { items: (await c.query('SELECT p.id,p.code,p.name,p.base_unit AS "baseUnit",p.sale_price::text AS price' + from + ' ORDER BY p.name,p.id LIMIT 20 OFFSET $3', [...v, page * 20])).rows, total: Number((await c.query('SELECT count(*)' + from, v)).rows[0].count), page }; }); }
    async write(raw: string, kind: string, input: Record<string, unknown>) { return this.run(raw, async (c, x) => { if (input.unitId && input.unitId !== x.activeUnitId)
        throw new ForbiddenException('Selecione a filial da operação.'); const fns: Record<string, string> = { customers: 'save_customer', credit: 'save_credit', program: 'save_program', loyalty: 'loyalty_operation', orders: 'create_order', 'orders/transition': 'transition_order', 'deliveries/transition': 'transition_delivery' }; const fn = fns[kind]; if (!fn)
        throw new NotFoundException(); if (input.customerId || input.id) {
        const target = input.customerId || input.id, table = input.customerId || kind === 'customers' ? 'customers' : kind.startsWith('deliveries') ? 'deliveries' : 'orders';
        if (!(await c.query('SELECT id FROM crm.' + table + ' WHERE tenant_id=$1 AND unit_id=$2 AND id=$3', [x.tenantId, x.activeUnitId, target])).rowCount)
            throw new NotFoundException('Registro indisponível nesta filial.');
    } return { id: (await c.query('SELECT crm.' + fn + '($1::jsonb) id', [JSON.stringify(input)])).rows[0].id }; }); }
}

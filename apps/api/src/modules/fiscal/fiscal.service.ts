import { ForbiddenException, NotFoundException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Permission, FiscalDraftInput, FiscalOverview, FiscalIssuerData, FiscalDetail } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
import { FocusGateway, type FiscalGateway, type GatewayDocument } from './focus.gateway';
import { prepareFiscal } from './prepare';
const D = `d.id,d.unit_id AS "unitId",d.sale_id AS "saleId",d.reference,d.model,d.environment,d.state,d.version,d.total::text,d.issuer_cnpj AS "issuerCnpj",d.access_key AS key,d.protocol,d.number,d.series,d.cancel_protocol AS "cancelProtocol",d.sefaz_code AS "sefazCode",d.message,d.reason,d.created_at AS "createdAt",d.updated_at AS "updatedAt",d.validation_errors AS "validationErrors",jsonb_build_object('xml',d.xml_path IS NOT NULL,'danfe',d.danfe_path IS NOT NULL,'cancelXml',d.xml_cancel_path IS NOT NULL) AS artifacts,d.qr_url AS "qrUrl"`;
type Context = {
    permissions: Permission[];
    tenantId: string;
    userId: string;
    activeUnitId: string | null;
};
export class FiscalService {
    constructor(private readonly auth: AuthService, private readonly gateway: FiscalGateway = new FocusGateway()) { }
    private require(ctx: Context, p: Permission) {
        if (!ctx.permissions.includes(p))
            throw new ForbiddenException('Você não tem permissão para esta ação fiscal.');
    }
    private async run<T>(raw: string, fn: (c: PoolClient, ctx: Context) => Promise<T>) {
        try {
            return await this.auth.withAccess(raw, async (c, ctx) => { this.require(ctx, 'fiscal.read'); return fn(c, ctx); });
        }
        catch (e) {
            const code = (e as {
                code?: string;
            }).code;
            if (code === '23505')
                throw new ConflictException('Já existe documento ativo para a venda ou confirmação registrada.');
            if (code === '23514')
                throw new ConflictException('Documento ou cadastro fiscal desatualizado. Confira estado, validações, venda confirmada e operações em andamento.');
            if (code === '42501')
                throw new ForbiddenException('Unidade ou ação fiscal não autorizada.');
            throw e;
        }
    }
    private async unit(c: PoolClient, ctx: Context, id = ctx.activeUnitId) {
        if (!id || !(await c.query("SELECT inventory.allowed($1,'fiscal.read',$2) AS allowed", [ctx.tenantId, id])).rows[0].allowed)
            throw new NotFoundException('Selecione uma filial fiscal autorizada.');
        return id;
    }
    private async identity(c: PoolClient, ctx: Context, unit: string) {
        const r = (await c.query(`SELECT coalesce(u.cnpj,c.cnpj) AS cnpj,c.legal_name AS name,u.kind,(u.kind='matriz' OR (u.kind='filial' AND u.cnpj IS NOT NULL)) AS eligible FROM organizations.units u JOIN organizations.companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id WHERE u.tenant_id=$1 AND u.id=$2`, [ctx.tenantId, unit])).rows[0];
        if (!r)
            throw new NotFoundException('Emitente indisponível.');
        return r;
    }
    async overview(raw: string): Promise<FiscalOverview> {
        return this.run(raw, async (c, ctx) => {
            const unit = ctx.activeUnitId;
            if (unit)
                await this.unit(c, ctx);
            const identity = unit ? await this.identity(c, ctx, unit) : { cnpj: '', name: '' };
            return { unitId: unit, issuerCnpj: identity.cnpj, issuerName: identity.name, issuer: unit ? (await c.query('SELECT id,data,version,reviewed_by AS "reviewedBy" FROM fiscal.issuer_profiles WHERE tenant_id=$1 AND unit_id=$2', [ctx.tenantId, unit])).rows[0] || null : null, integration: this.gateway.integration({ tenantId: ctx.tenantId, unitId: unit || '', issuerCnpj: identity.cnpj }), capabilities: { manage: ctx.permissions.includes('fiscal.manage'), issue: ctx.permissions.includes('fiscal.issue'), cancel: ctx.permissions.includes('fiscal.cancel'), pos: ctx.permissions.includes('pos.read'), products: ctx.permissions.includes('products.read') }, summary: unit ? (await c.query(`SELECT count(*) FILTER(WHERE state='draft')::int AS draft,count(*) FILTER(WHERE state IN('processing','cancel_pending'))::int AS processing,count(*) FILTER(WHERE state='authorized')::int AS authorized,count(*) FILTER(WHERE state='rejected')::int AS rejected,count(*) FILTER(WHERE state='uncertain')::int AS uncertain,count(*) FILTER(WHERE state='cancelled')::int AS cancelled FROM fiscal.documents WHERE tenant_id=$1 AND unit_id=$2`, [ctx.tenantId, unit])).rows[0] : { draft: 0, processing: 0, authorized: 0, rejected: 0, uncertain: 0, cancelled: 0 } };
        });
    }
    async documents(raw: string, f: {
        state: string;
        model: string;
        query: string;
        page: number;
    }) { return this.run(raw, async (c, ctx) => { const unit = await this.unit(c, ctx), where = ` WHERE d.tenant_id=$1 AND d.unit_id=$2 AND ($3='all' OR d.state=$3) AND ($4='all' OR d.model=$4) AND ($5='' OR position(lower($5) in lower(d.reference||' '||coalesce(d.access_key,'')||' '||(d.snapshot->>'saleNumber')))>0)`, values = [ctx.tenantId, unit, f.state, f.model, f.query]; return { items: (await c.query('SELECT ' + D + ' FROM fiscal.documents d' + where + ' ORDER BY d.created_at DESC,d.id LIMIT 20 OFFSET $6', [...values, f.page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM fiscal.documents d' + where, values)).rows[0].count), page: f.page }; }); }
    async detail(raw: string, id: string): Promise<FiscalDetail> {
        return this.run(raw, async (c, ctx) => {
            const r = (await c.query('SELECT ' + D + ',d.snapshot FROM fiscal.documents d WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0];
            if (!r)
                throw new NotFoundException('Documento não encontrado no acesso autorizado.');
            const { snapshot, ...document } = r;
            return { document, snapshot, operations: (await c.query(`SELECT id,kind,state,actor_name AS "actorName",created_at AS "createdAt",finished_at AS "finishedAt",CASE WHEN result IS NULL THEN NULL ELSE jsonb_build_object('state',result->>'state','message',result->>'message','sefazCode',result->>'sefazCode') END AS result FROM fiscal.operations WHERE tenant_id=$1 AND document_id=$2 ORDER BY created_at DESC,id LIMIT 100`, [ctx.tenantId, id])).rows };
        });
    }
    async products(raw: string, query: string, page: number) { return this.run(raw, async (c, ctx) => { this.require(ctx, 'products.read'); const unit = await this.unit(c, ctx), where = ` WHERE p.tenant_id=$1 AND ($3='' OR position(lower($3) in lower(p.code||' '||p.name))>0)`; return { items: (await c.query(`SELECT p.id,p.code,p.name,p.base_unit AS "baseUnit",p.active,CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('id',f.id,'data',f.data,'version',f.version,'reviewedBy',f.reviewed_by) END AS profile FROM inventory.products p LEFT JOIN fiscal.product_profiles f ON f.tenant_id=p.tenant_id AND f.product_id=p.id AND f.unit_id=$2` + where + ' ORDER BY p.active DESC,p.name,p.id LIMIT 20 OFFSET $4', [ctx.tenantId, unit, query, page * 20])).rows, total: Number((await c.query(`SELECT count(*) FROM inventory.products p WHERE p.tenant_id=$1 AND ($2='' OR position(lower($2) in lower(p.code||' '||p.name))>0)`, [ctx.tenantId, query])).rows[0].count), page }; }); }
    async sources(raw: string, query: string, page: number) { return this.run(raw, async (c, ctx) => { this.require(ctx, 'pos.read'); const unit = await this.unit(c, ctx), where = ` WHERE s.tenant_id=$1 AND s.unit_id=$2 AND s.status='confirmed' AND ($3='' OR position(lower($3) in lower(s.number))>0) AND NOT EXISTS(SELECT 1 FROM fiscal.documents d WHERE d.tenant_id=s.tenant_id AND d.sale_id=s.id AND d.state NOT IN('discarded','cancelled'))`; return { items: (await c.query(`SELECT s.id,s.number,s.total::text,s.created_at AS "createdAt",(SELECT jsonb_agg(jsonb_build_object('productId',x->>'productId','name',x->>'name','quantity',x->>'quantity','unitPrice',x->>'unitPrice','total',x->>'total')) FROM jsonb_array_elements(s.items) x) AS items FROM pos.sales s` + where + ' ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET $4', [ctx.tenantId, unit, query, page * 20])).rows, total: Number((await c.query('SELECT count(*) FROM pos.sales s' + where, [ctx.tenantId, unit, query])).rows[0].count), page }; }); }
    async profile(raw: string, input: Record<string, unknown>, product: boolean) { return this.run(raw, async (c, ctx) => { this.require(ctx, 'fiscal.manage'); await this.unit(c, ctx, input.unitId as string); return { ok: true, id: (await c.query('SELECT fiscal.save_profile($1::jsonb,$2) AS id', [JSON.stringify(input), product])).rows[0].id }; }); }
    async prepare(raw: string, input: FiscalDraftInput) {
        return this.run(raw, async (c, ctx) => {
            this.require(ctx, 'fiscal.manage');
            this.require(ctx, 'pos.read');
            const sale = (await c.query('SELECT id,unit_id AS "unitId",number,items,gross::text,discount::text,total::text,status,sandbox,current_payment_id FROM pos.sales WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, input.saleId])).rows[0];
            if (!sale || sale.status !== 'confirmed')
                throw new ConflictException('Selecione uma venda confirmada disponível.');
            await this.unit(c, ctx, sale.unitId);
            const identity = await this.identity(c, ctx, sale.unitId), issuer = (await c.query('SELECT data,version FROM fiscal.issuer_profiles WHERE tenant_id=$1 AND unit_id=$2', [ctx.tenantId, sale.unitId])).rows[0] || null;
            const profiles = (await c.query('SELECT product_id AS "productId",data,version FROM fiscal.product_profiles WHERE tenant_id=$1 AND unit_id=$2 AND product_id=ANY($3::uuid[])', [ctx.tenantId, sale.unitId, sale.items.map((i: any) => i.productId)])).rows;
            const methods = (await c.query("SELECT methods FROM pos.payments WHERE tenant_id=$1 AND id=$2 AND state='confirmed'", [ctx.tenantId, sale.current_payment_id])).rows[0]?.methods || [];
            const prepared = prepareFiscal(input, sale, issuer, profiles, identity, methods);
            if (!identity.eligible)
                prepared.errors.push('Somente matriz ou filial com CNPJ próprio pode preparar emissão neste incremento.');
            if (identity.name.length > 60)
                prepared.errors.push('Razão social do emitente excede o limite suportado de 60 caracteres.');
            return { ok: true, id: (await c.query('SELECT fiscal.save_document($1::jsonb,$2::jsonb) AS id', [JSON.stringify(input), JSON.stringify(prepared)])).rows[0].id };
        });
    }
    async discard(raw: string, input: Record<string, unknown>) { return this.run(raw, async (c, ctx) => { this.require(ctx, 'fiscal.manage'); return { ok: true, id: (await c.query('SELECT fiscal.discard($1::jsonb) AS id', [JSON.stringify(input)])).rows[0].id }; }); }
    async operation(raw: string, input: {
        documentId: string;
        version: number;
        kind: 'issue' | 'consult' | 'cancel';
        reason: string;
        requestKey: string;
    }) {
        const op = await this.run(raw, async (c, ctx) => {
            this.require(ctx, input.kind === 'cancel' ? 'fiscal.cancel' : 'fiscal.issue');
            const d = (await c.query('SELECT ' + D + ' FROM fiscal.documents d WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, input.documentId])).rows[0];
            if (!d)
                throw new NotFoundException('Documento não encontrado.');
            const document: GatewayDocument = { tenantId: ctx.tenantId, unitId: d.unitId, issuerCnpj: d.issuerCnpj, reference: d.reference, model: d.model, key: d.key, protocol: d.protocol };
            if (!this.gateway.integration(document).ready)
                throw new ServiceUnavailableException('Emissão e consulta externas aguardam integração de homologação configurada para esta rede, filial e CNPJ.');
            const queued = (await c.query('SELECT fiscal.queue_operation($1::jsonb) AS result', [JSON.stringify(input)])).rows[0].result;
            const p = (await c.query('SELECT dispatch_payload FROM fiscal.operations WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, queued.id])).rows[0];
            return { ...queued, document, payload: p.dispatch_payload };
        });
        if (op.dispatch) {
            const result = await this.gateway.execute(op.document, input.kind, op.payload);
            await this.run(raw, async (c) => { await c.query('SELECT fiscal.record_result($1,$2::jsonb)', [op.id, JSON.stringify(result)]); });
        }
        return { ok: true, id: input.documentId };
    }
    async file(raw: string, id: string, kind: 'xml' | 'danfe' | 'cancelXml') {
        const data = await this.run(raw, async (c, ctx) => {
            const d = (await c.query('SELECT ' + D + ',d.xml_path,d.danfe_path,d.xml_cancel_path FROM fiscal.documents d WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, id])).rows[0];
            if (!d || !['authorized', 'cancelled'].includes(d.state))
                throw new NotFoundException('Arquivo fiscal autorizado indisponível.');
            const path = kind === 'xml' ? d.xml_path : kind === 'danfe' ? d.danfe_path : d.xml_cancel_path;
            if (!path)
                throw new NotFoundException('Arquivo não disponibilizado pelo provedor.');
            return { document: { tenantId: ctx.tenantId, unitId: d.unitId, issuerCnpj: d.issuerCnpj, reference: d.reference, model: d.model, key: d.key, protocol: d.protocol } as GatewayDocument, path, number: d.number || d.reference };
        });
        const file = await this.gateway.download(data.document, data.path, kind);
        await this.run(raw, async (c) => { await c.query('SELECT fiscal.mark_download($1,$2)', [id, kind]); });
        return { ...file, name: 'NF' + data.document.model + '-homologacao-' + data.number + (kind === 'danfe' ? (file.type === 'application/pdf' ? '.pdf' : '.html') : '.xml') };
    }
}

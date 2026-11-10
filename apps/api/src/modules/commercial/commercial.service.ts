import { ForbiddenException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CommercialOverview } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
export class CommercialService {
    constructor(private readonly auth: AuthService) { }
    private async errors<T>(work: () => Promise<T>): Promise<T> {
        try {
            return await work();
        }
        catch (e) {
            const code = (e as {
                code?: string;
            }).code;
            if (code === '42501')
                throw new ForbiddenException('Operação comercial não autorizada. É necessário acesso Master ou proprietário com MFA.');
            if (code === '40001')
                throw new ConflictException('Registro alterado ou plano indisponível. Atualize antes de salvar.');
            if (code === '23505')
                throw new ConflictException('Nome ou identificador já utilizado.');
            if (code === '23514')
                throw new BadRequestException('Confira vigência, módulos, limites e uso atual da rede.');
            if (code === 'P0002')
                throw new NotFoundException('Rede indisponível.');
            throw e;
        }
    }
    private master<T>(raw: string, fn: (c: PoolClient) => Promise<T>) {
        return this.errors(() => this.auth.withIdentity(raw, async (c) => {
            if (!(await c.query('SELECT commercial.is_operator() AS allowed')).rows[0].allowed)
                throw new ForbiddenException('Painel exclusivo do Master Invictus com MFA.');
            return fn(c);
        }));
    }
    async overview(raw: string): Promise<CommercialOverview> {
        return this.auth.withAccess(raw, async (c, ctx) => {
            const flags = (await c.query("SELECT commercial.is_owner($1) AS owner,commercial.is_operator() AS operator,finance.today()::text AS today,EXISTS(SELECT 1 FROM identity.credentials WHERE user_id=$2 AND mfa_secret_enc IS NOT NULL) AS mfa", [ctx.tenantId, ctx.userId])).rows[0];
            const license = (await c.query('SELECT commercial.license($1) AS value', [ctx.tenantId])).rows[0].value;
            return { license, subscription: flags.owner ? await this.subscription(c, ctx.tenantId) : null, usage: flags.owner ? (await c.query('SELECT commercial.read_usage($1) AS value', [ctx.tenantId])).rows[0].value : null, isOwner: flags.owner, isOperator: flags.operator, canCustomize: flags.owner && flags.mfa, today: flags.today };
        });
    }
    private async subscription(c: PoolClient, id: string) { return (await c.query(`SELECT jsonb_build_object('tenantId',tenant_id,'plan',plan_snapshot,'enabledModules',enabled_modules,'state',state,'startsOn',starts_on,'endsOn',ends_on,'reason',reason,'version',version) AS value FROM commercial.subscriptions WHERE tenant_id=$1`, [id])).rows[0]?.value || null; }
    plans(raw: string) { return this.master(raw, async (c) => (await c.query('SELECT commercial.plan_json(p) AS value FROM commercial.plans p ORDER BY name,id')).rows.map(r => r.value)); }
    directory(raw: string, q: string, page: number) { return this.master(raw, async (c) => (await c.query('SELECT commercial.directory($1,$2) AS value', [q, page])).rows[0].value); }
    tenant(raw: string, id: string) {
        return this.master(raw, async (c) => {
            const usage = (await c.query('SELECT commercial.read_usage($1) AS value', [id])).rows[0].value;
            // Directory accepts no identifiers for arbitrary operational reads; commercial rows only.
            return { tenantId: id, subscription: await this.subscription(c, id), usage, branding: (await c.query('SELECT display_name AS "displayName",tagline,accent,logo_png AS "logoPng",coalesce(slug,\'\') AS slug,version FROM commercial.brandings WHERE tenant_id=$1', [id])).rows[0] || null };
        });
    }
    savePlan(raw: string, input: unknown) { return this.master(raw, async (c) => (await c.query('SELECT commercial.save_plan($1::jsonb) AS value', [JSON.stringify(input)])).rows[0].value); }
    saveSubscription(raw: string, input: unknown) { return this.master(raw, async (c) => (await c.query('SELECT commercial.save_subscription($1::jsonb) AS value', [JSON.stringify(input)])).rows[0].value); }
    async saveBranding(raw: string, input: unknown) {
        const session = await this.auth.session(raw);
        return this.errors(() => this.auth.withIdentity(raw, async (c) => {
            // Resolve the active tenant for ownership checks, never from a client-provided membership.
            await c.query("SELECT set_config('app.auth_tenant_id',$1,true)", [session.activeTenantId || '']);
            return (await c.query('SELECT commercial.save_branding($1::jsonb) AS value', [JSON.stringify(input)])).rows[0].value;
        }));
    }
    async events(raw: string, page: number) {
        const session = await this.auth.session(raw);
        return this.auth.withIdentity(raw, async (c) => {
            await c.query("SELECT set_config('app.auth_tenant_id',$1,true)", [session.activeTenantId || '']);
            const allowed = (await c.query('SELECT commercial.is_operator() OR commercial.is_owner($1) AS value', [session.activeTenantId])).rows[0].value;
            if (!allowed)
                throw new ForbiddenException('Histórico comercial restrito ao proprietário ou Master.');
            const items = (await c.query('SELECT id,tenant_id AS "tenantId",actor_name AS "actorName",action,before_data AS before,after_data AS after,created_at AS "createdAt" FROM commercial.events ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $1', [page * 20])).rows;
            return { items, total: Number((await c.query('SELECT count(*) FROM commercial.events')).rows[0].count), page };
        });
    }
}

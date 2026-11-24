import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AssistantOverview, AssistantTopic, AssistantDraftInput, AssistantDraft } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
import { TOPIC_PERMISSIONS } from './validation';

export class AssistantService {
  constructor(private readonly auth: AuthService) {}
  private context<T>(raw: string, work: (overview: AssistantOverview) => T): Promise<T> {
    return this.auth.withAccess(raw, async (db, ctx) => {
      if (!ctx.permissions.includes('reports.read') || !ctx.permissions.includes('organizations.read'))
        throw new ForbiddenException('Seu perfil não permite acessar a IA gerencial.');
      // No business records, costs, customer details or free-form SQL enter an AI context.
      const units = (await db.query(`SELECT u.id,u.name,co.trade_name AS "companyName"
        FROM organizations.units u JOIN organizations.companies co ON co.tenant_id=u.tenant_id AND co.id=u.company_id
        WHERE u.tenant_id=$1 AND inventory.allowed(u.tenant_id,'reports.read',u.id)
        AND inventory.allowed(u.tenant_id,'organizations.read',u.id) ORDER BY co.trade_name,u.name,u.id`, [ctx.tenantId])).rows;
      const topics: AssistantOverview['topics'] = [];
      for (const id of Object.keys(TOPIC_PERMISSIONS) as AssistantTopic[]) {
        const required = TOPIC_PERMISSIONS[id];
        if (!required.every(p => ctx.permissions.includes(p))) continue;
        const permitted = (await db.query(`SELECT u.id FROM organizations.units u WHERE u.tenant_id=$1 AND u.id=ANY($2::uuid[])
          AND NOT EXISTS(SELECT 1 FROM unnest($3::text[]) p WHERE NOT inventory.allowed(u.tenant_id,p,u.id))`, [ctx.tenantId, units.map(u => u.id), required])).rows;
        if (permitted.length) topics.push({ id, unitIds: permitted.map(u => u.id) });
      }
      const dates = (await db.query('SELECT finance.today()::text AS today,(finance.today()-29)::text AS "from",finance.today()::text AS "to"')).rows[0];
      return work({ state: 'disabled', provider: null, ...dates, units, topics });
    });
  }
  overview(raw: string) { return this.context(raw, overview => overview); }
  prepare(raw: string, input: AssistantDraftInput): Promise<AssistantDraft> {
    return this.context(raw, overview => {
      const unit = overview.units.find(u => u.id === input.unitId);
      if (!unit) throw new NotFoundException('Filial indisponível no acesso autorizado.');
      if (!overview.topics.some(t => t.id === input.topic && t.unitIds.includes(input.unitId)))
        throw new ForbiddenException('Tema indisponível no acesso autorizado.');
      return { ...input, state: 'draft', generatedAnswer: null, sentToProvider: false,
        unitName: unit.name, companyName: unit.companyName, preparedAt: new Date().toISOString() };
    });
  }
}

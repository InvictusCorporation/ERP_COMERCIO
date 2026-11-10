import { BadRequestException } from '@nestjs/common';
import { body, uuid } from '../identity/auth.controller';
import { field, date, page } from '../purchasing/validation';
import { REPORT_KINDS, type ReportFilters, type ReportKind } from '@invictus/contracts';
export function filters(v: unknown, options: {
    export?: boolean;
} = {}) { const i = body(v, ['from', 'to', 'companyId', 'unitId', 'category', 'supplierId', 'source', 'query', 'status', ...(options.export ? ['kind'] : ['page'])]), from = date(i.from), to = date(i.to); if ((from && !to) || (!from && to) || (from && to && (from > to || from < '1900-01-01' || to > '9998-12-31' || (Date.parse(to) - Date.parse(from)) / 86400000 > 366)))
    throw new BadRequestException('Informe as duas datas em ordem, com até 367 dias.'); const source = i.source ?? 'manual', status = i.status ?? 'all'; if (!['manual', 'sandbox'].includes(source as string) || !['all', 'missing', 'low', 'near_expiry', 'expired', 'no_movement', 'overdue'].includes(status as string))
    throw new BadRequestException('Origem ou situação inválida.'); const result: ReportFilters = { ...(from ? { from, to } : {}), ...(i.companyId !== undefined ? { companyId: uuid(i.companyId) } : {}), ...(i.unitId !== undefined ? { unitId: uuid(i.unitId) } : {}), ...(i.supplierId !== undefined ? { supplierId: uuid(i.supplierId) } : {}), category: field(i.category, 100), query: field(i.query, 100), source: source as 'manual' | 'sandbox', status: status as NonNullable<ReportFilters['status']> }; return { ...result, page: options.export ? 0 : page(i.page), ...(options.export ? { kind: kind(i.kind) } : {}) }; }
export function kind(v: unknown): ReportKind { if (typeof v !== 'string' || !Object.hasOwn(REPORT_KINDS, v))
    throw new BadRequestException('Relatório inválido.'); return v as ReportKind; }
export function validateDimensions(k: ReportKind, f: ReportFilters) { if (f.supplierId && k !== 'purchases')
    throw new BadRequestException('Fornecedor é um filtro de compras recebidas.'); if (f.category && ['cashflow', 'receivables', 'payables', 'closings'].includes(k))
    throw new BadRequestException('Categoria de produto não se aplica ao financeiro.'); if (f.status && f.status !== 'all' && !((k === 'stock' && ['missing', 'low', 'near_expiry', 'expired', 'no_movement'].includes(f.status)) || (['receivables', 'payables'].includes(k) && f.status === 'overdue')))
    throw new BadRequestException('Situação não aplicável a este relatório.'); }

import { BadRequestException } from '@nestjs/common';
import { FINANCE_METHODS, type FinanceAccountInput, type FinanceTitleInput, type FinanceSettlementInput } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { decimal } from '../inventory/validation';
import { field, date, version, reason } from '../purchasing/validation';
export { field, date, version, reason };
export function requiredDate(v: unknown) {
    const value = date(v);
    if (!value)
        throw new BadRequestException('Preencha a data.');
    return value;
}
function integer(v: unknown, min: number, max: number) {
    if (!Number.isInteger(v) || Number(v) < min || Number(v) > max)
        throw new BadRequestException('Número de parcelas ou intervalo inválido.');
    return Number(v);
}
export function accountInput(v: unknown): FinanceAccountInput {
    const i = body(v, ['id', 'version', 'unitId', 'name', 'kind', 'openingDate', 'openingAmount', 'active', 'requestKey']);
    if (!['cash', 'bank'].includes(i.kind as string) || typeof i.active !== 'boolean' || (i.id === undefined && i.active === false))
        throw new BadRequestException('Tipo ou situação da conta inválido.');
    return {
        ...(i.id === undefined ? {} : {
            id: uuid(i.id), version: version(i.version)
        }), unitId: uuid(i.unitId), name: field(i.name, 100, true), kind: i.kind as 'cash' | 'bank', openingDate: requiredDate(i.openingDate), openingAmount: decimal(i.openingAmount, 2), active: i.active, requestKey: uuid(i.requestKey)
    };
}
export function titleInput(v: unknown): FinanceTitleInput {
    const i = body(v, ['unitId', 'kind', 'counterparty', 'description', 'category', 'reference', 'notes', 'issueDate', 'dueDate', 'amount', 'installments', 'intervalDays', 'requestKey']);
    if (!['payable', 'receivable'].includes(i.kind as string))
        throw new BadRequestException('Tipo de título inválido.');
    const issueDate = requiredDate(i.issueDate), dueDate = requiredDate(i.dueDate);
    const installments = integer(i.installments, 1, 36), intervalDays = integer(i.intervalDays, 1, 366);
    const last = new Date(Date.parse(dueDate + 'T00:00:00Z') + (installments - 1) * intervalDays * 86400000);
    if (dueDate < issueDate || last.getUTCFullYear() > 9999)
        throw new BadRequestException('Vencimentos fora do calendário permitido.');
    return {
        unitId: uuid(i.unitId), kind: i.kind as 'payable' | 'receivable', counterparty: field(i.counterparty, 160, true), description: field(i.description, 160, true), category: field(i.category, 80), reference: field(i.reference, 120), notes: field(i.notes, 1000), issueDate, dueDate, amount: decimal(i.amount, 2, 999999999, true), installments, intervalDays, requestKey: uuid(i.requestKey)
    };
}
export function settlementInput(v: unknown): FinanceSettlementInput {
    const i = body(v, ['titleId', 'version', 'accountId', 'principal', 'interest', 'fee', 'discount', 'postedDate', 'method', 'reference', 'notes', 'requestKey']);
    if (typeof i.method !== 'string' || !Object.hasOwn(FINANCE_METHODS, i.method))
        throw new BadRequestException('Forma inválida.');
    return {
        titleId: uuid(i.titleId), version: version(i.version), accountId: uuid(i.accountId), principal: decimal(i.principal, 2, 999999999, true), interest: decimal(i.interest, 2), fee: decimal(i.fee, 2), discount: decimal(i.discount, 2), postedDate: requiredDate(i.postedDate), method: i.method as keyof typeof FINANCE_METHODS, reference: field(i.reference, 120), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey)
    };
}

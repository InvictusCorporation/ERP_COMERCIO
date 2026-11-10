import { BadRequestException } from '@nestjs/common';
import type { FiscalIssuerData, FiscalProductData, FiscalRecipient, FiscalDraftInput } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { field, version } from '../purchasing/validation';
import { decimal } from '../inventory/validation';
import { STATES, validCnpj, normalizeCnpj } from '../organizations/validation';
export { field, version };
const invalid = (m = 'Confira os campos fiscais informados.'): never => { throw new BadRequestException(m); };
function choice<T extends string>(v: unknown, values: readonly T[]): T {
    if (typeof v !== 'string' || !values.includes(v as T))
        return invalid();
    return v as T;
}
function digits(v: unknown, n: number, optional = false) {
    const s = field(v, n, !optional);
    if (s === '' && optional)
        return '';
    if (!new RegExp('^\\d{' + n + '}$').test(s))
        return invalid('Confira o número de dígitos do código fiscal.');
    return s;
}
function bool(v: unknown) {
    if (typeof v !== 'boolean')
        return invalid();
    return v;
}
function ie(v: unknown, optional = false) {
    const s = field(v, 14, !optional).toUpperCase();
    if (!s && optional)
        return '';
    if (!/^[A-Z0-9]{2,14}$/.test(s))
        return invalid('Inscrição estadual inválida.');
    return s;
}
function address(i: Record<string, unknown>, optional = false) { return { uf: optional && !i.uf ? '' : choice(i.uf, STATES), municipalityCode: digits(i.municipalityCode, 7, optional), city: field(i.city, 60, !optional), street: field(i.street, 60, !optional), number: field(i.number, 60, !optional), district: field(i.district, 60, !optional), postalCode: digits(i.postalCode, 8, optional) }; }
export function issuerInput(v: unknown) { const i = body(v, ['unitId', 'version', 'data']), d = body(i.data, ['uf', 'crt', 'ie', 'municipalityCode', 'city', 'street', 'number', 'district', 'postalCode', 'reviewed']); return { unitId: uuid(i.unitId), ...(i.version === undefined ? {} : { version: version(i.version) }), data: { ...address(d), crt: choice(d.crt, ['1', '3']), ie: ie(d.ie), reviewed: bool(d.reviewed) } satisfies FiscalIssuerData }; }
export function productInput(v: unknown) {
    const i = body(v, ['unitId', 'productId', 'version', 'data']), d = body(i.data, ['ncm', 'cest', 'cfop', 'origin', 'icmsCode', 'icmsRate', 'pisCode', 'pisRate', 'cofinsCode', 'cofinsRate', 'rtc', 'ibsCode', 'classification', 'ibsStateRate', 'ibsCityRate', 'cbsRate', 'reviewed']);
    const data: FiscalProductData = { ncm: digits(d.ncm, 8), cest: digits(d.cest, 7, true), cfop: choice(d.cfop, ['5101', '5102']), origin: choice(d.origin, ['0', '1', '2', '3', '4', '5', '6', '7', '8']), icmsCode: choice(d.icmsCode, ['102', '00']), icmsRate: decimal(d.icmsRate, 4, 100), pisCode: choice(d.pisCode, ['01', '07', '08', '09']), pisRate: decimal(d.pisRate, 4, 100), cofinsCode: choice(d.cofinsCode, ['01', '07', '08', '09']), cofinsRate: decimal(d.cofinsRate, 4, 100), rtc: choice(d.rtc, ['standard', 'not_applicable']), ibsCode: field(d.ibsCode, 3), classification: field(d.classification, 6), ibsStateRate: decimal(d.ibsStateRate, 4, 100), ibsCityRate: decimal(d.ibsCityRate, 4, 100), cbsRate: decimal(d.cbsRate, 4, 100), reviewed: bool(d.reviewed) };
    if ((data.icmsCode === '102' && Number(data.icmsRate) !== 0) || (data.pisCode !== '01' && Number(data.pisRate) !== 0) || (data.cofinsCode !== '01' && Number(data.cofinsRate) !== 0))
        return invalid('Situação sem destaque exige alíquota zero.');
    if (data.rtc === 'standard') {
        if (data.ibsCode !== '000' || !/^\d{6}$/.test(data.classification))
            return invalid('Este incremento suporta IBS/CBS padrão CST 000 com classificação explícita.');
    }
    else if (data.ibsCode || data.classification || Number(data.ibsStateRate) || Number(data.ibsCityRate) || Number(data.cbsRate))
        return invalid('Não aplicável deve ter classificação vazia e alíquotas zero.');
    return { unitId: uuid(i.unitId), productId: uuid(i.productId), ...(i.version === undefined ? {} : { version: version(i.version) }), data };
}
export function validCpf(s: string) {
    if (!/^\d{11}$/.test(s) || /^(.)\1{10}$/.test(s))
        return false;
    for (let length = 9; length <= 10; length++) {
        let sum = 0;
        for (let x = 0; x < length; x++)
            sum += Number(s[x]) * (length + 1 - x);
        const rest = (sum * 10) % 11;
        if (Number(s[length]) !== (rest === 10 ? 0 : rest))
            return false;
    }
    return true;
}
export function recipientInput(v: unknown): FiscalRecipient {
    const i = body(v, ['name', 'document', 'ieIndicator', 'ie', 'uf', 'municipalityCode', 'city', 'street', 'number', 'district', 'postalCode']);
    const doc = field(i.document, 24).replace(/[.\/\-\s]/g, '').toUpperCase();
    if (doc && !validCpf(doc) && !validCnpj(doc))
        return invalid('CPF ou CNPJ do destinatário inválido.');
    const indicator = choice(i.ieIndicator, ['1', '2', '9']);
    return { name: field(i.name, 60), document: doc, ieIndicator: indicator, ie: ie(i.ie, true), ...address(i, true) };
}
export function draftInput(v: unknown): FiscalDraftInput {
    const i = body(v, ['id', 'version', 'saleId', 'model', 'nature', 'recipient', 'bases', 'additional', 'requestKey']);
    if (!Array.isArray(i.bases) || i.bases.length > 100)
        return invalid('Confira as bases tributárias de até 100 itens.');
    const seen = new Set();
    return { ...(i.id === undefined ? {} : { id: uuid(i.id), version: version(i.version) }), saleId: uuid(i.saleId), model: choice(i.model, ['55', '65']), nature: field(i.nature, 60, true), recipient: recipientInput(i.recipient), bases: i.bases.map(v => {
            const b = body(v, ['productId', 'icmsBase', 'pisBase', 'cofinsBase', 'ibsBase']), productId = uuid(b.productId);
            if (seen.has(productId))
                return invalid('Base duplicada para o produto.');
            seen.add(productId);
            const amount = (x: unknown) => x === undefined || x === '' ? '' : decimal(x, 2);
            return { productId, icmsBase: amount(b.icmsBase), pisBase: amount(b.pisBase), cofinsBase: amount(b.cofinsBase), ibsBase: amount(b.ibsBase) };
        }), additional: field(i.additional, 2000), requestKey: uuid(i.requestKey) };
}
export function justification(v: unknown) {
    const s = field(v, 255, true);
    if (s.length < 15)
        return invalid('Justificativa deve ter de 15 a 255 caracteres.');
    return s;
}

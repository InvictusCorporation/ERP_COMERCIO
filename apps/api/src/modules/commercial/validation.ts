import { BadRequestException } from '@nestjs/common';
import { COMMERCIAL_MODULES, MODULE_DEPENDENCIES, SUBSCRIPTION_STATES, type CommercialModule } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { field, date } from '../purchasing/validation';
const invalid = (message = 'Confira os campos da configuração comercial.') => { throw new BadRequestException(message); };
export const ACCENTS = ['#ffcc00', '#7dd3fc', '#6ee7b7', '#fda4af', '#c4b5fd'];
function version(v: unknown) { if (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 2147483646)
    invalid(); return Number(v); }
export function modules(v: unknown): CommercialModule[] {
    if (!Array.isArray(v) || !v.length || v.length > 10 || v.some(x => typeof x !== 'string' || !Object.hasOwn(COMMERCIAL_MODULES, x)) || new Set(v).size !== v.length)
        invalid('Selecione módulos válidos, sem repetição.');
    const items = v as CommercialModule[];
    for (const id of items)
        for (const dependency of MODULE_DEPENDENCIES[id] || [])
            if (!items.includes(dependency))
                invalid(COMMERCIAL_MODULES[id] + ' exige ' + COMMERCIAL_MODULES[dependency] + '.');
    return items;
}
export function planInput(v: unknown) {
    const i = body(v, ['id', 'version', 'name', 'description', 'modules', 'limits', 'monthlyPrice', 'active']), limits = body(i.limits, ['users', 'units', 'products']);
    for (const k of ['users', 'units', 'products'])
        if (limits[k] !== null && (!Number.isInteger(limits[k]) || Number(limits[k]) < 1 || Number(limits[k]) > 1000000))
            invalid('Limites devem ser inteiros positivos ou não definidos.');
    const price = i.monthlyPrice === null ? null : field(i.monthlyPrice, 13, true);
    if (price !== null && !/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(price))
        invalid('Informe o preço mensal em reais ou deixe sem definição.');
    if (typeof i.active !== 'boolean')
        invalid();
    const ver = version(i.version);
    if ((!!i.id) !== (ver > 0))
        invalid();
    return { id: i.id ? uuid(i.id) : undefined, version: ver, name: field(i.name, 60, true), description: field(i.description, 500), modules: modules(i.modules), limits, monthlyPrice: price, active: i.active };
}
export function subscriptionInput(v: unknown) {
    const i = body(v, ['tenantId', 'planId', 'planVersion', 'version', 'enabledModules', 'state', 'startsOn', 'endsOn', 'reason']);
    const startsOn = date(i.startsOn), endsOn = date(i.endsOn), planVersion = version(i.planVersion);
    if (!startsOn || !endsOn || startsOn > endsOn || !planVersion || typeof i.state !== 'string' || !Object.hasOwn(SUBSCRIPTION_STATES, i.state))
        invalid('Confira plano, situação e vigência da assinatura.');
    return { tenantId: uuid(i.tenantId), planId: uuid(i.planId), planVersion, version: version(i.version), enabledModules: modules(i.enabledModules), state: i.state, startsOn, endsOn, reason: field(i.reason, 300, true) };
}
export function brandingInput(v: unknown) {
    const i = body(v, ['tenantId', 'version', 'displayName', 'tagline', 'accent', 'logoPng', 'slug']), accent = field(i.accent, 7, true), logoPng = field(i.logoPng, 280000), slug = field(i.slug, 40);
    if (!ACCENTS.includes(accent))
        invalid('Selecione uma das cores com contraste adequado.');
    if (slug && (!/^[a-z][a-z0-9-]{2,39}$/.test(slug) || ['www', 'api', 'admin', 'master', 'app', 'login', 'suporte', 'invictus'].includes(slug)))
        invalid('Identificador de endereço inválido ou reservado.');
    if (logoPng) {
        if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(logoPng))
            invalid('A logomarca deve ser um arquivo PNG.');
        const encoded = logoPng.slice(22), bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded || bytes.length > 204800 || bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR' || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(20) < 1 || bytes.readUInt32BE(16) > 1024 || bytes.readUInt32BE(20) > 1024 || bytes.subarray(-8).toString('hex') !== '49454e44ae426082')
            invalid('PNG inválido: use até 200 KB e 1024 × 1024 pixels.');
    }
    return { tenantId: uuid(i.tenantId), version: version(i.version), displayName: field(i.displayName, 64, true), tagline: field(i.tagline, 100), accent, logoPng, slug };
}

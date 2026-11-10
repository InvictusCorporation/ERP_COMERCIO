import { BadRequestException } from '@nestjs/common';
import { body, uuid } from '../identity/auth.controller';
import { field, version, date } from '../purchasing/validation';
import { decimal } from '../inventory/validation';
const bad = (message = 'Confira os campos do supermercado.'): never => { throw new BadRequestException(message); };
function bool(v: unknown) { if (typeof v !== 'boolean')
    return bad(); return v; }
function base(i: Record<string, unknown>) { return { unitId: uuid(i.unitId), ...(i.id === undefined ? {} : { id: uuid(i.id), version: version(i.version) }) }; }
export function sectorInput(v: unknown) { const i = body(v, ['unitId', 'id', 'version', 'name', 'active']), name = field(i.name, 80, true); if (name.length < 2)
    return bad(); return { ...base(i), name, active: bool(i.active) }; }
export function profileInput(v: unknown) { const i = body(v, ['unitId', 'productId', 'version', 'sectorId', 'weighted', 'plu']), weighted = bool(i.weighted), plu = field(i.plu, 5); if ((plu && !/^\d{5}$/.test(plu)) || plu === '00000' || (weighted && !plu))
    return bad('PLU deve ter cinco dígitos, diferente de zero.'); return { unitId: uuid(i.unitId), productId: uuid(i.productId), sectorId: uuid(i.sectorId), ...(i.version === undefined ? {} : { version: version(i.version) }), weighted, plu }; }
export function scaleInput(v: unknown) { const i = body(v, ['unitId', 'id', 'version', 'name', 'model', 'mode', 'prefix', 'capacity', 'resolution', 'active', 'reviewed']), mode = i.mode; if (!['manual_kg', 'ean13_weight'].includes(mode as string))
    return bad(); const prefix = field(i.prefix, 2); if (mode === 'ean13_weight' ? !/^2\d$/.test(prefix) : !!prefix)
    return bad('Formato interno exige prefixo de 20 a 29; modo manual usa prefixo vazio.'); const capacity = decimal(i.capacity, 3, 99.999, true), resolution = decimal(i.resolution, 3, 1, true); if (Number(resolution) > Number(capacity))
    return bad(); return { ...base(i), name: field(i.name, 80, true), model: field(i.model, 80), mode: mode as 'manual_kg' | 'ean13_weight', prefix, capacity, resolution, active: bool(i.active), reviewed: bool(i.reviewed) }; }
export function weighInput(v: unknown) { const i = body(v, ['unitId', 'scaleId', 'productId', 'lotId', 'gross', 'tare', 'stable', 'requestKey']), gross = decimal(i.gross, 3, 99.999, true), tare = decimal(i.tare, 3, 99.999); if (Number(tare) >= Number(gross) || !bool(i.stable))
    return bad('Confirme peso estável e bruto superior à tara.'); return { unitId: uuid(i.unitId), scaleId: uuid(i.scaleId), productId: uuid(i.productId), lotId: i.lotId ? uuid(i.lotId) : '', gross, tare, stable: true, requestKey: uuid(i.requestKey) }; }
export function recipeInput(v: unknown) { const i = body(v, ['unitId', 'id', 'version', 'sectorId', 'name', 'outputProductId', 'yieldQuantity', 'ingredients', 'notes', 'active', 'reviewed']); if (!Array.isArray(i.ingredients) || !i.ingredients.length || i.ingredients.length > 50)
    return bad('Ficha deve ter de um a cinquenta insumos.'); const outputProductId = uuid(i.outputProductId), seen = new Set<string>(); return { ...base(i), sectorId: uuid(i.sectorId), name: field(i.name, 100, true), outputProductId, yieldQuantity: decimal(i.yieldQuantity, 3, 999999999, true), ingredients: i.ingredients.map(v => { const x = body(v, ['productId', 'quantity']), productId = uuid(x.productId); if (productId === outputProductId || seen.has(productId))
        return bad('Insumos devem ser únicos e diferentes da saída.'); seen.add(productId); return { productId, quantity: decimal(x.quantity, 3, 999999999, true) }; }), notes: field(i.notes, 2500), active: bool(i.active), reviewed: bool(i.reviewed) }; }
export function runInput(v: unknown) { const i = body(v, ['unitId', 'recipeId', 'recipeVersion', 'factor', 'actualQuantity', 'lotCode', 'expiresOn', 'reason', 'requestKey']), lotCode = field(i.lotCode, 60, true).toUpperCase(), expiresOn = date(i.expiresOn); if (!/^[A-Z0-9][A-Z0-9._/ -]{0,59}$/.test(lotCode) || !expiresOn)
    return bad('Informe lote e validade do produto acabado.'); const reason = field(i.reason, 300, true); if (reason.length < 3)
    return bad('Informe um motivo com pelo menos três caracteres.'); return { unitId: uuid(i.unitId), recipeId: uuid(i.recipeId), recipeVersion: version(i.recipeVersion), factor: decimal(i.factor, 3, 999.999, true), actualQuantity: decimal(i.actualQuantity, 3, 999999999, true), lotCode, expiresOn, reason, requestKey: uuid(i.requestKey) }; }
export function reverseInput(v: unknown) { const i = body(v, ['id', 'reason', 'requestKey']), reason = field(i.reason, 300, true); if (reason.length < 3)
    return bad('Informe um motivo com pelo menos três caracteres.'); return { id: uuid(i.id), reason, requestKey: uuid(i.requestKey) }; }

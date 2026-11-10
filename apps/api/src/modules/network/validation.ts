import { BadRequestException } from '@nestjs/common';
import { body, uuid } from '../identity/auth.controller';
import { field, version, date } from '../purchasing/validation';
import { decimal } from '../inventory/validation';
const bad = (message = 'Confira os campos da operação de rede.'): never => { throw new BadRequestException(message); };
function reason(v: unknown) { const s = field(v, 300, true); if (s.length < 3)
    return bad('Informe motivo com pelo menos três caracteres.'); return s; }
export function transferInput(v: unknown) { const i = body(v, ['sourceId', 'destinationId', 'items', 'reason', 'notes', 'requestKey']), sourceId = uuid(i.sourceId), destinationId = uuid(i.destinationId); if (sourceId === destinationId)
    return bad('Selecione origem e destino distintos.'); if (!Array.isArray(i.items) || !i.items.length || i.items.length > 50)
    return bad('Inclua até cinquenta produtos.'); const seen = new Set<string>(); return { sourceId, destinationId, items: i.items.map(v => { const x = body(v, ['productId', 'quantity']), productId = uuid(x.productId); if (seen.has(productId))
        return bad('Agrupe o produto na mesma linha.'); seen.add(productId); return { productId, quantity: decimal(x.quantity, 3, 999999999, true) }; }), reason: reason(i.reason), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey) }; }
export function transitionInput(v: unknown) { const i = body(v, ['id', 'version', 'action', 'reason', 'documentRef', 'items', 'requestKey']); if (!['approve', 'cancel', 'dispatch', 'receive'].includes(i.action as string))
    return bad(); const action = i.action as 'approve' | 'cancel' | 'dispatch' | 'receive'; const documentRef = field(i.documentRef, 120); if (action === 'dispatch' && documentRef.length < 3)
    return bad('Informe a referência documental conferida para expedição.'); const seen = new Set<string>(); if (action === 'receive' && (!Array.isArray(i.items) || !i.items.length || i.items.length > 50))
    return bad('Confira as quantidades recebidas.'); if (action !== 'receive' && i.items !== undefined)
    return bad(); return { id: uuid(i.id), version: version(i.version), action, reason: reason(i.reason), documentRef, ...(action === 'receive' ? { items: (i.items as unknown[]).map(v => { const x = body(v, ['lineId', 'quantity']), lineId = uuid(x.lineId); if (seen.has(lineId))
            return bad(); seen.add(lineId); return { lineId, quantity: decimal(x.quantity, 3, 999999999, true) }; }) } : {}), requestKey: uuid(i.requestKey) }; }
export function centralInput(v: unknown) { const i = body(v, ['unitId', 'supplierId', 'items', 'freight', 'extraCost', 'discount', 'expectedDate', 'notes', 'requestKey']); if (!Array.isArray(i.items) || !i.items.length || i.items.length > 50)
    return bad(); const products = new Set<string>(); let count = 0; return { unitId: uuid(i.unitId), supplierId: uuid(i.supplierId), items: i.items.map(v => { const x = body(v, ['productId', 'unitCost', 'allocations']), productId = uuid(x.productId); if (products.has(productId) || !Array.isArray(x.allocations) || !x.allocations.length)
        return bad(); products.add(productId); const units = new Set<string>(); return { productId, unitCost: decimal(x.unitCost, 6), allocations: x.allocations.map(v => { const a = body(v, ['unitId', 'quantity']), unitId = uuid(a.unitId); if (units.has(unitId) || ++count > 100)
            return bad('Até cem destinações distintas por produto e unidade.'); units.add(unitId); return { unitId, quantity: decimal(a.quantity, 3, 999999999, true) }; }) }; }), freight: decimal(i.freight, 2), extraCost: decimal(i.extraCost, 2), discount: decimal(i.discount, 2), expectedDate: date(i.expectedDate) || '', notes: field(i.notes, 1000), requestKey: uuid(i.requestKey) }; }
export function distributeInput(v: unknown) { const i = body(v, ['id', 'reason', 'requestKey']); return { id: uuid(i.id), reason: reason(i.reason), requestKey: uuid(i.requestKey) }; }

import { BadRequestException } from '@nestjs/common';
import { body, uuid } from '../identity/auth.controller';
import { field, version, date } from '../purchasing/validation';
import { decimal } from '../inventory/validation';
import { validCnpj, normalizeCnpj, STATES } from '../organizations/validation';
const bad = (): never => { throw new BadRequestException('Confira os campos, documento, datas e quantidades.'); };
const bool = (v: unknown) => typeof v === 'boolean' ? v : bad();
const integer = (v: unknown, min: number, max: number) => Number.isInteger(v) && Number(v) >= min && Number(v) <= max ? Number(v) : bad();
export function validCpf(v: string) { if (!/^\d{11}$/.test(v) || /^(.)\1{10}$/.test(v))
    return false; const digit = (n: number) => { const sum = [...v.slice(0, n)].reduce((a, c, i) => a + Number(c) * (n + 1 - i), 0); const r = (sum * 10) % 11; return (r === 10 ? 0 : r) === Number(v[n]); }; return digit(9) && digit(10); }
export function address(v: unknown) { const i = body(v, ['street', 'number', 'complement', 'district', 'city', 'state', 'postalCode']); const state = field(i.state, 2).toUpperCase(), postalCode = field(i.postalCode, 9).replace('-', ''); if (state && !STATES.includes(state) || postalCode && !/^\d{8}$/.test(postalCode))
    return bad(); return { street: field(i.street, 160), number: field(i.number, 20), complement: field(i.complement, 80), district: field(i.district, 80), city: field(i.city, 80), state, postalCode }; }
export function customerInput(v: unknown) { const i = body(v, ['id', 'version', 'unitId', 'name', 'document', 'phone', 'email', 'address', 'notes', 'active', 'loyaltyOptIn', 'requestKey']); const document = normalizeCnpj(field(i.document, 20)), name = field(i.name, 120, true), email = field(i.email, 254).toLowerCase(), phone = field(i.phone, 20); if (name.length < 2 || document && !(validCpf(document) || validCnpj(document)) || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone && (!/^[+()\d .-]{8,20}$/.test(phone) || phone.replace(/\D/g,'').length<8 || phone.replace(/\D/g,'').length>15))
    return bad(); return { ...(i.id ? { id: uuid(i.id), version: version(i.version) } : {}), unitId: uuid(i.unitId), name, document, phone, email, address: address(i.address), notes: field(i.notes, 1000), active: bool(i.active), loyaltyOptIn: bool(i.loyaltyOptIn), requestKey: uuid(i.requestKey) }; }
const reason = (v: unknown) => { const s = field(v, 300, true); return s.length >= 3 ? s : bad(); };
export function creditInput(v: unknown) { const i = body(v, ['customerId', 'limit', 'enabled', 'reason', 'version']); return { customerId: uuid(i.customerId), limit: decimal(i.limit, 2), enabled: bool(i.enabled), reason: reason(i.reason), ...(i.version !== undefined ? { version: version(i.version) } : {}) }; }
export function programInput(v: unknown) { const i = body(v, ['unitId', 'centsPerPoint', 'active', 'version']); return { unitId: uuid(i.unitId), centsPerPoint: integer(i.centsPerPoint, 1, 1000000000), active: bool(i.active), ...(i.version !== undefined ? { version: version(i.version) } : {}) }; }
export function loyaltyInput(v: unknown) { const i = body(v, ['customerId', 'kind', 'points', 'reason', 'requestKey']); if (!['adjust', 'redeem'].includes(i.kind as string) || typeof i.points !== 'string' || !/^[-]?[1-9]\d{0,8}$/.test(i.points) || i.kind === 'redeem' && i.points.startsWith('-'))
    return bad(); return { customerId: uuid(i.customerId), kind: i.kind, points: i.points, reason: reason(i.reason), requestKey: uuid(i.requestKey) }; }
export function orderInput(v: unknown) { const i = body(v, ['unitId', 'customerId', 'mode', 'channel', 'payment', 'items', 'address', 'deliveryFee', 'dueDate', 'installments', 'intervalDays', 'notes', 'requestKey']); if (!['pickup', 'delivery'].includes(i.mode as string) || !['counter', 'seller', 'mobile'].includes(i.channel as string) || !['paid', 'credit'].includes(i.payment as string) || !Array.isArray(i.items) || !i.items.length || i.items.length > 50)
    return bad(); const a = address(i.address); if (i.mode === 'delivery' && (!a.street || !a.number || !a.city || !a.state))
    return bad(); const seen = new Set<string>(), deliveryFee = decimal(i.deliveryFee, 2); if (i.mode === 'pickup' && Number(deliveryFee) !== 0)
    return bad(); const installments = integer(i.installments, 1, 36), intervalDays = integer(i.intervalDays, 0, 365); if (installments > 1 && intervalDays === 0)
    return bad(); const dueDate = date(i.dueDate); if (!dueDate)
    return bad(); return { unitId: uuid(i.unitId), customerId: uuid(i.customerId), mode: i.mode, channel: i.channel, payment: i.payment, address: a, deliveryFee, dueDate, installments, intervalDays, notes: field(i.notes, 1000), requestKey: uuid(i.requestKey), items: i.items.map(v => { const x = body(v, ['productId', 'quantity', 'expectedPrice']), productId = uuid(x.productId); if (seen.has(productId))
        return bad(); seen.add(productId); return { productId, quantity: decimal(x.quantity, 3, 999999999, true), expectedPrice: decimal(x.expectedPrice, 2, 999999999, true) }; }) }; }
export function orderAction(v: unknown) { const i = body(v, ['id', 'version', 'action', 'reason', 'accountId', 'method', 'reference', 'requestKey']); if (!['reserve', 'ready', 'cancel', 'fulfill', 'return'].includes(i.action as string))
    return bad(); if (i.method !== undefined && !['cash', 'pix', 'debit', 'credit', 'transfer', 'other'].includes(i.method as string))
    return bad(); return { id: uuid(i.id), version: version(i.version), action: i.action, reason: reason(i.reason), ...(i.accountId ? { accountId: uuid(i.accountId) } : {}), ...(i.method ? { method: i.method } : {}), reference: field(i.reference, 120), requestKey: uuid(i.requestKey) }; }
export function deliveryAction(v: unknown) { const i = body(v, ['id', 'version', 'action', 'courier', 'recipient', 'scheduledOn', 'reason', 'requestKey']); if (!['assigned', 'out', 'delivered', 'failed'].includes(i.action as string))
    return bad(); const courier = field(i.courier, 120), recipient = field(i.recipient, 120); if (i.action === 'assigned' && courier.length < 2 || i.action === 'delivered' && recipient.length < 2)
    return bad(); return { id: uuid(i.id), version: version(i.version), action: i.action, courier, recipient, scheduledOn: date(i.scheduledOn), reason: reason(i.reason), requestKey: uuid(i.requestKey) }; }

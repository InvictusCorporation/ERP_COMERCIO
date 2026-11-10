import { BadRequestException } from '@nestjs/common';
import { PAYMENT_METHODS, type SaveSaleInput, type BeginPaymentInput } from '@invictus/contracts';
import { body, uuid } from '../identity/auth.controller';
import { decimal } from '../inventory/validation';
import { field, version, reason } from '../purchasing/validation';
export { field, version, reason };
export function saveInput(v: unknown): SaveSaleInput { const i = body(v, ['id', 'version', 'registerId', 'items', 'discount', 'notes', 'requestKey']); if (!Array.isArray(i.items) || i.items.length < 1 || i.items.length > 100)
    throw new BadRequestException('Inclua de 1 a 100 produtos.'); const seen = new Set(); return { ...(i.id !== undefined ? { id: uuid(i.id), version: version(i.version) } : {}), registerId: uuid(i.registerId), items: i.items.map(v => { const x = body(v, ['productId', 'quantity', 'expectedPrice']); const productId = uuid(x.productId); if (seen.has(productId))
        throw new BadRequestException('Agrupe o produto na mesma linha.'); seen.add(productId); return { productId, quantity: decimal(x.quantity, 3, 999999999, true), expectedPrice: decimal(x.expectedPrice, 2, 999999999, true) }; }), discount: decimal(i.discount, 2), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey) }; }
export function paymentInput(v: unknown): BeginPaymentInput { const i = body(v, ['saleId', 'version', 'methods', 'requestKey']); if (!Array.isArray(i.methods) || i.methods.length < 1 || i.methods.length > 4)
    throw new BadRequestException('Escolha de uma a quatro formas de pagamento.'); const seen = new Set(); return { saleId: uuid(i.saleId), version: version(i.version), requestKey: uuid(i.requestKey), methods: i.methods.map(v => { const x = body(v, ['method', 'amount', 'tendered']); if (typeof x.method !== 'string' || !Object.hasOwn(PAYMENT_METHODS, x.method) || seen.has(x.method))
        throw new BadRequestException('Forma de pagamento inválida ou repetida.'); seen.add(x.method); return { method: x.method as keyof typeof PAYMENT_METHODS, amount: decimal(x.amount, 2, 999999999, true), tendered: decimal(x.tendered, 2) }; }) }; }

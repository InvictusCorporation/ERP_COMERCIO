import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SALE_STATUSES } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { gtin, decimal } from '../inventory/validation';
import { page } from '../purchasing/validation';
import { saveInput, paymentInput, field, version, reason } from './validation';
import { PosService } from './pos.service';
@Controller('pos')
@UseFilters(AuthExceptionFilter)
export class PosController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(PosService)
    private readonly pos: PosService) { }
    private raw(r: Request) {
        const token = this.auth.tokenFromCookies(r.headers.cookie);
        if (!token)
            throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
        return token;
    }
    private mutation(r: Request) {
        if (r.headers.origin !== this.auth.config.origin ||
            r.headers["sec-fetch-site"] === "cross-site" ||
            !r.is("application/json"))
            throw new ForbiddenException("Origem da solicitação inválida.");
        const token = this.raw(r), supplied = r.headers["x-csrf-token"];
        if (typeof supplied !== "string" ||
            !equalSecret(supplied, csrfToken(token, this.auth.config.encryptionKey)))
            throw new ForbiddenException("Solicitação de segurança inválida. Atualize a página.");
        return token;
    }
    @Get('overview')
    overview(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['unitId']); return this.pos.overview(this.raw(r), i.unitId === undefined ? undefined : uuid(i.unitId)); }
    @Get('catalog')
    catalog(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['unitId', 'query', 'barcode', 'page']); return this.pos.catalog(this.raw(r), i.unitId === undefined ? undefined : uuid(i.unitId), field(i.query, 100), i.barcode === undefined ? '' : gtin(i.barcode), page(i.page)); }
    @Get('sales')
    sales(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['unitId', 'query', 'status', 'page']), status = field(i.status, 12) || 'all'; if (status !== 'all' && !Object.hasOwn(SALE_STATUSES, status))
        throw new BadRequestException('Situação inválida.'); return this.pos.sales(this.raw(r), { ...(i.unitId === undefined ? {} : { unitId: uuid(i.unitId) }), query: field(i.query, 100), status, page: page(i.page) }); }
    @Get('sales/:id')
    detail(
    @Req()
    r: Request,
    @Param('id')
    id: string) { return this.pos.detail(this.raw(r), uuid(id)); }
    @Get('registers')
    registers(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['unitId', 'page']); return this.pos.registers(this.raw(r), i.unitId === undefined ? undefined : uuid(i.unitId), page(i.page)); }
    @Get('registers/:id')
    register(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { const i = body(v, ['page']); return this.pos.register(this.raw(r), uuid(id), page(i.page)); }
    @Post('registers/open')
    @HttpCode(200)
    open(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['unitId', 'code', 'openingAmount', 'requestKey']), code = field(i.code, 24, true).toUpperCase(); if (!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(code))
        throw new BadRequestException('Código do caixa inválido.'); return this.pos.mutate(raw, 'open', { unitId: uuid(i.unitId), code, openingAmount: decimal(i.openingAmount, 2), requestKey: uuid(i.requestKey) }); }
    @Post('registers/adjust')
    @HttpCode(200)
    adjust(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['registerId', 'kind', 'amount', 'reason', 'requestKey']); if (!['supply', 'withdraw'].includes(i.kind as string))
        throw new BadRequestException('Movimento inválido.'); return this.pos.mutate(raw, 'adjust', { registerId: uuid(i.registerId), kind: i.kind, amount: decimal(i.amount, 2, 999999999, true), reason: reason(i.reason), requestKey: uuid(i.requestKey) }); }
    @Post('registers/close')
    @HttpCode(200)
    close(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['registerId', 'counted', 'notes', 'requestKey']); return this.pos.mutate(raw, 'close', { registerId: uuid(i.registerId), counted: decimal(i.counted, 2), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey) }); }
    @Post('sales/save')
    @HttpCode(200)
    save(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.pos.mutate(this.mutation(r), 'save', { ...saveInput(v) }); }
    @Post('payments')
    @HttpCode(200)
    payment(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.pos.mutate(this.mutation(r), 'payment', { ...paymentInput(v) }); }
    @Post('payments/simulate')
    @HttpCode(200)
    settle(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['paymentId', 'outcome']); if (!['confirmed', 'authorized', 'declined'].includes(i.outcome as string))
        throw new BadRequestException('Resultado de teste inválido.'); return this.pos.mutate(raw, 'settle', { paymentId: uuid(i.paymentId), outcome: i.outcome }); }
    @Post('sales/cancel')
    @HttpCode(200)
    cancel(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['saleId', 'version', 'reason']); return this.pos.mutate(raw, 'cancel', { saleId: uuid(i.saleId), version: version(i.version), reason: reason(i.reason) }); }
    @Post('sales/return')
    @HttpCode(200)
    refund(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), i = body(v, ['saleId', 'registerId', 'version', 'reason', 'requestKey']); return this.pos.mutate(raw, 'return', { saleId: uuid(i.saleId), registerId: uuid(i.registerId), version: version(i.version), reason: reason(i.reason), requestKey: uuid(i.requestKey) }); }
}

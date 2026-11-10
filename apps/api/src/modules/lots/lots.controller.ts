import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field, date, page } from '../purchasing/validation';
import { lotInput } from './validation';
import { LotsService } from './lots.service';
@Controller('lots')
@UseFilters(AuthExceptionFilter)
export class LotsController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(LotsService)
    private readonly lots: LotsService) { }
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
    v: unknown) { body(v, []); return this.lots.overview(this.raw(r)); }
    @Get('products')
    products(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['query', 'page', 'low']);
        if (i.low !== undefined && !['true', 'false'].includes(i.low as string))
            throw new BadRequestException('Filtro inválido.');
        return this.lots.products(this.raw(r), field(i.query, 100), page(i.page), i.low === 'true');
    }
    @Get('batches')
    batches(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['query', 'status', 'page']), status = i.status ?? 'all';
        if (!['all', 'expired', 'near', 'valid', 'blocked', 'empty'].includes(status as string))
            throw new BadRequestException('Situação inválida.');
        return this.lots.list(this.raw(r), { query: field(i.query, 100), status: status as string, page: page(i.page) });
    }
    @Get('batches/:id')
    detail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { const i = body(v, ['page']); return this.lots.detail(this.raw(r), uuid(id), page(i.page)); }
    @Get('losses')
    losses(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['from', 'to', 'query', 'page']), from = date(i.from), to = date(i.to);
        if (!from || !to || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366)
            throw new BadRequestException('Informe período válido de até 367 dias, com início anterior ao fim.');
        return this.lots.losses(this.raw(r), { from, to, query: field(i.query, 100), page: page(i.page) });
    }
    @Post('commands')
    @HttpCode(200)
    command(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.lots.command(this.mutation(r), lotInput(v)); }
}

import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field, date, page } from '../purchasing/validation';
import { transferInput, transitionInput, centralInput, distributeInput } from './validation';
import { NetworkService } from './network.service';
@Controller('network')
@UseFilters(AuthExceptionFilter)
export class NetworkController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(NetworkService)
    private readonly network: NetworkService) { }
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
    v: unknown) { const i = body(v, ['from', 'to']), from = date(i.from), to = date(i.to); if ((from && !to) || (!from && to) || (from && to && (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366)))
        throw new BadRequestException('Informe período de até 367 dias.'); return this.network.overview(this.raw(r), from || '', to || ''); }
    @Get('products')
    products(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['unitId', 'query', 'page']); return this.network.products(this.raw(r), i.unitId === undefined ? undefined : uuid(i.unitId), field(i.query, 100), page(i.page)); }
    @Get('transfers')
    transfers(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'status', 'page']), status = i.status || 'all'; if (!["all", "draft", "approved", "in_transit", "received", "cancelled"].includes(status as string))
        throw new BadRequestException('Situação inválida.'); return this.network.list(this.raw(r), 'transfers', field(i.query, 100), status as string, page(i.page)); }
    @Get('transfers/:id')
    transfersDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.network.detail(this.raw(r), 'transfers', uuid(id)); }
    @Get('centrals')
    centrals(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'status', 'page']), status = i.status || 'all'; if (!["all", "draft", "approved", "partial", "received", "cancelled"].includes(status as string))
        throw new BadRequestException('Situação inválida.'); return this.network.list(this.raw(r), 'centrals', field(i.query, 100), status as string, page(i.page)); }
    @Get('centrals/:id')
    centralsDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.network.detail(this.raw(r), 'centrals', uuid(id)); }
    @Post('transfers')
    @HttpCode(200)
    createSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.network.write(this.mutation(r), 'create', transferInput(v)); }
    @Post('transfers/transition')
    @HttpCode(200)
    transitionSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.network.write(this.mutation(r), 'transition', transitionInput(v)); }
    @Post('centrals')
    @HttpCode(200)
    centralSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.network.write(this.mutation(r), 'central', centralInput(v)); }
    @Post('centrals/distribute')
    @HttpCode(200)
    distributeSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.network.write(this.mutation(r), 'distribute', distributeInput(v)); }
}

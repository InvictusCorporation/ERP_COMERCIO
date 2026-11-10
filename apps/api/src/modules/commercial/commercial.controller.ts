import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field } from '../purchasing/validation';
import { page } from '../purchasing/validation';
import { planInput, subscriptionInput, brandingInput } from './validation';
import { CommercialService } from './commercial.service';
@Controller('commercial')
@UseFilters(AuthExceptionFilter)
export class CommercialController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(CommercialService)
    private readonly service: CommercialService) { }
    private raw(r: Request) { const raw = this.auth.tokenFromCookies(r.headers.cookie); if (!raw)
        throw new UnauthorizedException('Entre novamente.'); return raw; }
    private mutation(r: Request) { if (r.headers.origin !== this.auth.config.origin || r.headers['sec-fetch-site'] === 'cross-site' || !r.is('application/json'))
        throw new ForbiddenException('Origem inválida.'); const raw = this.raw(r), supplied = r.headers['x-csrf-token']; if (typeof supplied !== 'string' || !equalSecret(supplied, csrfToken(raw, this.auth.config.encryptionKey)))
        throw new ForbiddenException('Atualize a página para confirmar esta operação.'); return raw; }
    @Get('overview')
    overview(
    @Req()
    r: Request) { return this.service.overview(this.raw(r)); }
    @Get('plans')
    plans(
    @Req()
    r: Request) { return this.service.plans(this.raw(r)); }
    @Get('tenants')
    tenants(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.service.directory(this.raw(r), field(i.query, 100), page(i.page)); }
    @Get('tenants/:id')
    tenant(
    @Req()
    r: Request,
    @Param('id')
    id: string) { return this.service.tenant(this.raw(r), uuid(id)); }
    @Get('events')
    events(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['page']); return this.service.events(this.raw(r), page(i.page)); }
    @Post('plans')
    @HttpCode(200)
    savePlan(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.service.savePlan(this.mutation(r), planInput(v)); }
    @Post('subscriptions')
    @HttpCode(200)
    saveSubscription(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.service.saveSubscription(this.mutation(r), subscriptionInput(v)); }
    @Post('branding')
    @HttpCode(200)
    saveBranding(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.service.saveBranding(this.mutation(r), brandingInput(v)); }
}

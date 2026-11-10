import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field, date, page } from '../purchasing/validation';
import { filters, kind } from './validation';
import { ReportsService } from './reports.service';
@Controller('reports')
@UseFilters(AuthExceptionFilter)
export class ReportsController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(ReportsService)
    private readonly reports: ReportsService) { }
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
    v: unknown) { const f = filters(v); return this.reports.overview(this.raw(r), f); }
    @Get('suppliers')
    suppliers(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.reports.suppliers(this.raw(r), field(i.query, 100), page(i.page)); }
    @Get('data/:kind')
    report(
    @Req()
    r: Request,
    @Param('kind')
    k: string,
    @Query()
    v: unknown) { const f = filters(v); return this.reports.report(this.raw(r), kind(k), f, f.page); }
    @Post('export')
    @HttpCode(200)
    export(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const raw = this.mutation(r), f = filters(v, { export: true }); return this.reports.export(raw, f.kind!, f); }
}

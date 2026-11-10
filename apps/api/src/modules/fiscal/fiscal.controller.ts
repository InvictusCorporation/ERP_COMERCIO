import { Controller, Get, Post, Body, Req, Query, Param, Res, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FISCAL_STATES } from '@invictus/contracts';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { page } from '../purchasing/validation';
import { issuerInput, productInput, draftInput, field, version, justification } from './validation';
import { FiscalService } from './fiscal.service';
@Controller('fiscal')
@UseFilters(AuthExceptionFilter)
export class FiscalController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(FiscalService)
    private readonly fiscal: FiscalService) { }
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
    v: unknown) { body(v, []); return this.fiscal.overview(this.raw(r)); }
    @Get('documents')
    documents(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['state', 'model', 'query', 'page']), state = i.state ?? 'all', model = i.model ?? 'all';
        if ((state !== 'all' && (typeof state !== 'string' || !Object.hasOwn(FISCAL_STATES, state))) || !['all', '55', '65'].includes(model as string))
            throw new BadRequestException('Filtro fiscal inválido.');
        return this.fiscal.documents(this.raw(r), { state: state as string, model: model as string, query: field(i.query, 100), page: page(i.page) });
    }
    @Get('documents/:id')
    detail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.fiscal.detail(this.raw(r), uuid(id)); }
    @Get('products')
    products(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.fiscal.products(this.raw(r), field(i.query, 100), page(i.page)); }
    @Get('sources')
    sources(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.fiscal.sources(this.raw(r), field(i.query, 100), page(i.page)); }
    @Post('issuer')
    @HttpCode(200)
    issuer(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.fiscal.profile(this.mutation(r), issuerInput(v), false); }
    @Post('products')
    @HttpCode(200)
    product(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.fiscal.profile(this.mutation(r), productInput(v), true); }
    @Post('documents/prepare')
    @HttpCode(200)
    prepare(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.fiscal.prepare(this.mutation(r), draftInput(v)); }
    @Post('documents/discard')
    @HttpCode(200)
    discard(
    @Req()
    r: Request,
    @Body()
    v: unknown) { const i = body(v, ['documentId', 'version', 'reason']); return this.fiscal.discard(this.mutation(r), { documentId: uuid(i.documentId), version: version(i.version), reason: justification(i.reason) }); }
    @Post('operations')
    @HttpCode(200)
    operation(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['documentId', 'version', 'kind', 'reason', 'requestKey']);
        if (!['issue', 'consult', 'cancel'].includes(i.kind as string))
            throw new BadRequestException('Operação fiscal inválida.');
        return this.fiscal.operation(this.mutation(r), { documentId: uuid(i.documentId), version: version(i.version), kind: i.kind as 'issue' | 'consult' | 'cancel', reason: i.kind === 'cancel' ? justification(i.reason) : field(i.reason, 255), requestKey: uuid(i.requestKey) });
    }
    @Get('documents/:id/files/:kind')
    async file(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Param('kind')
    kind: string,
    @Query()
    v: unknown,
    @Res()
    res: Response) {
        body(v, []);
        if (!['xml', 'danfe', 'cancelXml'].includes(kind))
            throw new BadRequestException('Tipo de arquivo inválido.');
        const f = await this.fiscal.file(this.raw(r), uuid(id), kind as 'xml' | 'danfe' | 'cancelXml');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
        res.setHeader('Content-Type', f.type);
        res.setHeader('Content-Disposition', 'attachment; filename="' + f.name + '"');
        res.send(f.bytes);
    }
}

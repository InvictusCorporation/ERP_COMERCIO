import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field, date, page } from '../purchasing/validation';
import { sectorInput, profileInput, scaleInput, weighInput, recipeInput, runInput, reverseInput } from './validation';
import { SupermarketService } from './supermarket.service';
@Controller('supermarket')
@UseFilters(AuthExceptionFilter)
export class SupermarketController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(SupermarketService)
    private readonly supermarket: SupermarketService) { }
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
    v: unknown) { body(v, []); return this.supermarket.overview(this.raw(r)); }
    @Get('sectors')
    sectors(
    @Req()
    r: Request,
    @Query()
    v: unknown) { body(v, []); return this.supermarket.configs(this.raw(r), 'sectors'); }
    @Get('scales')
    scales(
    @Req()
    r: Request,
    @Query()
    v: unknown) { body(v, []); return this.supermarket.configs(this.raw(r), 'scales'); }
    @Get('products')
    products(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page', 'weighted']); if (i.weighted !== undefined && !['true', 'false'].includes(i.weighted as string))
        throw new BadRequestException('Filtro inválido.'); return this.supermarket.products(this.raw(r), field(i.query, 100), page(i.page), i.weighted === 'true'); }
    @Get('lots')
    lots(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['productId']); return this.supermarket.lots(this.raw(r), uuid(i.productId)); }
    @Get('recipes')
    recipes(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.supermarket.recipes(this.raw(r), field(i.query, 100), page(i.page)); }
    @Get('weighings')
    weighings(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.supermarket.records(this.raw(r), 'weighings', field(i.query, 100), page(i.page)); }
    @Get('weighings/:id')
    weighingsDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.supermarket.detail(this.raw(r), 'weighings', uuid(id)); }
    @Get('runs')
    runs(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.supermarket.records(this.raw(r), 'runs', field(i.query, 100), page(i.page)); }
    @Get('runs/:id')
    runsDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.supermarket.detail(this.raw(r), 'runs', uuid(id)); }
    @Post('sectors')
    @HttpCode(200)
    sectorSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'sector', sectorInput(v)); }
    @Post('products')
    @HttpCode(200)
    productSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'product', profileInput(v)); }
    @Post('scales')
    @HttpCode(200)
    scaleSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'scale', scaleInput(v)); }
    @Post('weighings')
    @HttpCode(200)
    weighSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'weigh', weighInput(v)); }
    @Post('recipes')
    @HttpCode(200)
    recipeSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'recipe', recipeInput(v)); }
    @Post('runs/confirm')
    @HttpCode(200)
    runSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'run', runInput(v)); }
    @Post('runs/reverse')
    @HttpCode(200)
    reverseSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.supermarket.write(this.mutation(r), 'reverse', reverseInput(v)); }
}

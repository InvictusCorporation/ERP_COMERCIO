import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { field, date, page } from '../purchasing/validation';
import { customerInput, creditInput, programInput, loyaltyInput, orderInput, orderAction, deliveryAction } from './validation';
import { CrmService } from './crm.service';
@Controller('crm')
@UseFilters(AuthExceptionFilter)
export class CrmController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(CrmService)
    private readonly crm: CrmService) { }
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
    v: unknown) { body(v, []); return this.crm.overview(this.raw(r)); }
    @Get('products')
    products(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page']); return this.crm.products(this.raw(r), field(i.query, 100), page(i.page)); }
    @Get('customers/:id/history')
    history(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { const i = body(v, ['page']); return this.crm.history(this.raw(r), uuid(id), page(i.page)); }
    @Get('customers')
    customersList(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page', 'customerId']); return this.crm.list(this.raw(r), 'customers', field(i.query, 100), page(i.page), i.customerId ? uuid(i.customerId) : undefined); }
    @Get('orders')
    ordersList(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page', 'customerId']); return this.crm.list(this.raw(r), 'orders', field(i.query, 100), page(i.page), i.customerId ? uuid(i.customerId) : undefined); }
    @Get('deliveries')
    deliveriesList(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page', 'customerId']); return this.crm.list(this.raw(r), 'deliveries', field(i.query, 100), page(i.page), i.customerId ? uuid(i.customerId) : undefined); }
    @Get('loyalty')
    loyaltyList(
    @Req()
    r: Request,
    @Query()
    v: unknown) { const i = body(v, ['query', 'page', 'customerId']); return this.crm.list(this.raw(r), 'loyalty', field(i.query, 100), page(i.page), i.customerId ? uuid(i.customerId) : undefined); }
    @Get('customers/:id')
    customersDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.crm.detail(this.raw(r), 'customers', uuid(id)); }
    @Get('orders/:id')
    ordersDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.crm.detail(this.raw(r), 'orders', uuid(id)); }
    @Get('deliveries/:id')
    deliveriesDetail(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) { body(v, []); return this.crm.detail(this.raw(r), 'deliveries', uuid(id)); }
    @Post('customers')
    @HttpCode(200)
    customerInputSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'customers', customerInput(v)); }
    @Post('credit')
    @HttpCode(200)
    creditInputSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'credit', creditInput(v)); }
    @Post('program')
    @HttpCode(200)
    programInputSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'program', programInput(v)); }
    @Post('loyalty')
    @HttpCode(200)
    loyaltyInputSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'loyalty', loyaltyInput(v)); }
    @Post('orders')
    @HttpCode(200)
    orderInputSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'orders', orderInput(v)); }
    @Post('orders/transition')
    @HttpCode(200)
    orderActionSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'orders/transition', orderAction(v)); }
    @Post('deliveries/transition')
    @HttpCode(200)
    deliveryActionSave(
    @Req()
    r: Request,
    @Body()
    v: unknown) { return this.crm.write(this.mutation(r), 'deliveries/transition', deliveryAction(v)); }
}

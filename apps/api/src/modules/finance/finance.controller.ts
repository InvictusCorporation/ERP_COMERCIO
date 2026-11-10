import { Controller, Get, Post, Body, Req, Query, Param, Inject, HttpCode, UseFilters, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter, body, uuid } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { decimal } from '../inventory/validation';
import { page } from '../purchasing/validation';
import { accountInput, titleInput, settlementInput, field, date, requiredDate, version, reason } from './validation';
import { FinanceService } from './finance.service';
@Controller('finance')
@UseFilters(AuthExceptionFilter)
export class FinanceController {
    constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(FinanceService)
    private readonly finance: FinanceService) {
    }
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
    v: unknown) {
        body(v, []);
        return this.finance.overview(this.raw(r));
    }
    @Get('titles')
    titles(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['kind', 'status', 'query', 'page', 'from', 'to']);
        const kind = i.kind ?? 'payable', status = i.status ?? 'all';
        if (!['payable', 'receivable'].includes(kind as string) || !['all', 'open', 'partial', 'paid', 'overdue', 'cancelled'].includes(status as string))
            throw new BadRequestException('Filtro financeiro inválido.');
        const from = date(i.from), to = date(i.to);
        if (from && to && to < from)
            throw new BadRequestException('Período inválido.');
        return this.finance.titles(this.raw(r), {
            kind: kind as string, status: status as string, query: field(i.query, 100), page: page(i.page), from, to
        });
    }
    @Get('titles/:id')
    title(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) {
        body(v, []);
        return this.finance.title(this.raw(r), uuid(id));
    }
    @Get('accounts')
    accounts(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['page']);
        return this.finance.accounts(this.raw(r), page(i.page));
    }
    @Get('accounts/:id')
    account(
    @Req()
    r: Request,
    @Param('id')
    id: string,
    @Query()
    v: unknown) {
        const i = body(v, ['page']);
        return this.finance.account(this.raw(r), uuid(id), page(i.page));
    }
    private period(v: unknown, paging = false) {
        const i = body(v, paging ? ['accountId', 'from', 'to', 'page'] : ['accountId', 'from', 'to']);
        const from = requiredDate(i.from), to = requiredDate(i.to);
        if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 365)
            throw new BadRequestException('Escolha um período de até 366 dias.');
        return {
            accountId: i.accountId ? uuid(i.accountId) : null, from, to, page: paging ? page(i.page) : 0
        };
    }
    @Get('entries')
    entries(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        return this.finance.entries(this.raw(r), this.period(v, true));
    }
    @Get('flow')
    flow(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        return this.finance.flow(this.raw(r), this.period(v));
    }
    @Get('sources')
    sources(
    @Req()
    r: Request,
    @Query()
    v: unknown) {
        const i = body(v, ['page']);
        return this.finance.sources(this.raw(r), page(i.page));
    }
    @Post('accounts/save')
    @HttpCode(200)
    saveAccount(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        return this.finance.mutate(this.mutation(r), 'account', accountInput(v));
    }
    @Post('titles/save')
    @HttpCode(200)
    saveTitle(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        return this.finance.mutate(this.mutation(r), 'title', titleInput(v));
    }
    @Post('titles/change')
    @HttpCode(200)
    change(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['titleId', 'version', 'dueDate', 'notes']);
        return this.finance.mutate(this.mutation(r), 'change', {
            titleId: uuid(i.titleId), version: version(i.version), dueDate: requiredDate(i.dueDate), notes: field(i.notes, 1000)
        });
    }
    @Post('titles/cancel')
    @HttpCode(200)
    cancel(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['titleId', 'version', 'reason']);
        return this.finance.mutate(this.mutation(r), 'cancel', {
            titleId: uuid(i.titleId), version: version(i.version), reason: reason(i.reason)
        });
    }
    @Post('settlements')
    @HttpCode(200)
    settle(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        return this.finance.mutate(this.mutation(r), 'settle', settlementInput(v));
    }
    @Post('settlements/reverse')
    @HttpCode(200)
    reverse(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['settlementId', 'reason']);
        return this.finance.mutate(this.mutation(r), 'reverse', {
            settlementId: uuid(i.settlementId), reason: reason(i.reason)
        });
    }
    @Post('cash')
    @HttpCode(200)
    cash(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['accountId', 'destinationId', 'kind', 'amount', 'postedDate', 'reason', 'requestKey']);
        if (!['supply', 'withdraw', 'transfer'].includes(i.kind as string))
            throw new BadRequestException('Operação inválida.');
        return this.finance.mutate(this.mutation(r), 'cash', {
            accountId: uuid(i.accountId), ...(i.kind === 'transfer' ? {
                destinationId: uuid(i.destinationId)
            } : {}), kind: i.kind, amount: decimal(i.amount, 2, 999999999, true), postedDate: requiredDate(i.postedDate), reason: reason(i.reason), requestKey: uuid(i.requestKey)
        });
    }
    @Post('accounts/close')
    @HttpCode(200)
    close(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['accountId', 'throughDate', 'counted', 'notes', 'requestKey']);
        return this.finance.mutate(this.mutation(r), 'close', {
            accountId: uuid(i.accountId), throughDate: requiredDate(i.throughDate), counted: decimal(i.counted, 2), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey)
        });
    }
    @Post('accounts/reopen')
    @HttpCode(200)
    reopen(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['closingId', 'reason']);
        return this.finance.mutate(this.mutation(r), 'reopen', {
            closingId: uuid(i.closingId), reason: reason(i.reason)
        });
    }
    @Post('sources/import')
    @HttpCode(200)
    import(
    @Req()
    r: Request,
    @Body()
    v: unknown) {
        const i = body(v, ['receiptId', 'dueDate', 'notes', 'requestKey']);
        return this.finance.mutate(this.mutation(r), 'import', {
            receiptId: uuid(i.receiptId), dueDate: requiredDate(i.dueDate), notes: field(i.notes, 1000), requestKey: uuid(i.requestKey)
        });
    }
}

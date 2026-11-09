import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  Param,
  Inject,
  HttpCode,
  UseFilters,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PURCHASE_STATUSES } from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
import { AuthExceptionFilter, body, uuid } from "../identity/auth.controller";
import { csrfToken, equalSecret } from "../identity/crypto";
import { PurchasingService } from "./purchasing.service";
import {
  supplierInput,
  purchaseInput,
  receiveInput,
  field,
  page,
  version,
  reason,
} from "./validation";
@Controller("purchasing")
@UseFilters(AuthExceptionFilter)
export class PurchasingController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PurchasingService) private readonly purchases: PurchasingService,
  ) {}
  private raw(r: Request) {
    const token = this.auth.tokenFromCookies(r.headers.cookie);
    if (!token)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return token;
  }
  private mutation(r: Request) {
    if (
      r.headers.origin !== this.auth.config.origin ||
      r.headers["sec-fetch-site"] === "cross-site" ||
      !r.is("application/json")
    )
      throw new ForbiddenException("Origem da solicitação inválida.");
    const token = this.raw(r),
      supplied = r.headers["x-csrf-token"];
    if (
      typeof supplied !== "string" ||
      !equalSecret(supplied, csrfToken(token, this.auth.config.encryptionKey))
    )
      throw new ForbiddenException(
        "Solicitação de segurança inválida. Atualize a página.",
      );
    return token;
  }

  @Get("suppliers") suppliers(@Req() r: Request, @Query() v: unknown) {
    const i = body(v, ["query", "status", "page"]);
    const status = field(i.status, 10) || "active";
    if (!["active", "inactive", "all"].includes(status))
      throw new BadRequestException("Situação inválida.");
    return this.purchases.suppliers(
      this.raw(r),
      field(i.query, 100),
      status,
      page(i.page),
    );
  }
  @Get("suppliers/:id") supplier(@Req() r: Request, @Param("id") id: string) {
    return this.purchases.supplier(this.raw(r), uuid(id));
  }
  @Post("suppliers/save") @HttpCode(200) saveSupplier(
    @Req() r: Request,
    @Body() v: unknown,
  ) {
    return this.purchases.saveSupplier(this.mutation(r), supplierInput(v));
  }
  @Get("options") options(@Req() r: Request, @Query() v: unknown) {
    const i = body(v, ["supplierQuery", "productQuery"]);
    return this.purchases.options(
      this.raw(r),
      field(i.supplierQuery, 100),
      field(i.productQuery, 100),
    );
  }
  @Get("orders") orders(@Req() r: Request, @Query() v: unknown) {
    const i = body(v, ["query", "status", "unitId", "supplierId", "page"]);
    const status = field(i.status, 12) || "all";
    if (status !== "all" && !Object.hasOwn(PURCHASE_STATUSES, status))
      throw new BadRequestException("Situação inválida.");
    return this.purchases.orders(this.raw(r), {
      query: field(i.query, 100),
      status,
      ...(i.unitId !== undefined ? { unitId: uuid(i.unitId) } : {}),
      ...(i.supplierId !== undefined ? { supplierId: uuid(i.supplierId) } : {}),
      page: page(i.page),
    });
  }
  @Get("orders/:id") detail(
    @Req() r: Request,
    @Param("id") id: string,
    @Query() v: unknown,
  ) {
    const i = body(v, ["page"]);
    return this.purchases.detail(this.raw(r), uuid(id), page(i.page));
  }
  @Post("orders/save") @HttpCode(200) save(
    @Req() r: Request,
    @Body() v: unknown,
  ) {
    return this.purchases.save(this.mutation(r), purchaseInput(v));
  }
  @Post("orders/transition") @HttpCode(200) transition(
    @Req() r: Request,
    @Body() v: unknown,
  ) {
    const raw = this.mutation(r),
      i = body(v, ["id", "version", "action", "reason"]);
    if (i.action !== "approve" && i.action !== "cancel")
      throw new BadRequestException("Ação inválida.");
    return this.purchases.transition(
      raw,
      uuid(i.id),
      version(i.version),
      i.action,
      i.action === "cancel" ? reason(i.reason) : field(i.reason, 300),
    );
  }
  @Post("receipts") @HttpCode(200) receive(
    @Req() r: Request,
    @Body() v: unknown,
  ) {
    return this.purchases.receive(this.mutation(r), receiveInput(v));
  }
  @Post("receipts/reverse") @HttpCode(200) reverse(
    @Req() r: Request,
    @Body() v: unknown,
  ) {
    const raw = this.mutation(r),
      i = body(v, ["id", "version", "reason", "requestKey"]);
    return this.purchases.reverse(
      raw,
      uuid(i.id),
      version(i.version),
      reason(i.reason),
      uuid(i.requestKey),
    );
  }
}

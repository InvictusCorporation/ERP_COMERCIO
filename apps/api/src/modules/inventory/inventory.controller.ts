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
import { AuthService } from "../identity/auth.service";
import { AuthExceptionFilter, body, uuid } from "../identity/auth.controller";
import { csrfToken, equalSecret } from "../identity/crypto";
import { InventoryService } from "./inventory.service";
import { productInput, movementInput, decimal } from "./validation";
function query(value: unknown, allowed: string[]) {
  return body(value, allowed);
}
function page(v: unknown) {
  if (v === undefined) return 0;
  if (typeof v !== "string" || !/^\d{1,4}$/.test(v) || Number(v) > 1000)
    throw new BadRequestException("Página inválida.");
  return Number(v);
}
@Controller("inventory")
@UseFilters(AuthExceptionFilter)
export class InventoryController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
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
  @Get("products") list(@Req() r: Request, @Query() value: unknown) {
    const i = query(value, ["unitId", "query", "status", "page"]);
    if (
      i.query !== undefined &&
      (typeof i.query !== "string" || i.query.length > 100)
    )
      throw new BadRequestException("Busca inválida.");
    if (
      i.status !== undefined &&
      !["all", "active", "inactive", "low"].includes(i.status as string)
    )
      throw new BadRequestException("Filtro inválido.");
    return this.inventory.list(this.raw(r), {
      ...(i.unitId ? { unitId: uuid(i.unitId) } : {}),
      query: (i.query as string) || "",
      status: (i.status as string) || "active",
      page: page(i.page),
    });
  }
  @Get("products/:id") detail(
    @Req() r: Request,
    @Param("id") id: string,
    @Query() value: unknown,
  ) {
    const i = query(value, ["unitId", "page"]);
    return this.inventory.detail(
      this.raw(r),
      uuid(id),
      i.unitId ? uuid(i.unitId) : undefined,
      page(i.page),
    );
  }
  @Post("products/save") @HttpCode(200) save(
    @Req() r: Request,
    @Body() value: unknown,
  ) {
    return this.inventory.save(this.mutation(r), productInput(value));
  }
  @Post("movements") @HttpCode(200) move(
    @Req() r: Request,
    @Body() value: unknown,
  ) {
    return this.inventory.move(this.mutation(r), movementInput(value));
  }
  @Post("settings") @HttpCode(200) settings(
    @Req() r: Request,
    @Body() value: unknown,
  ) {
    const raw = this.mutation(r),
      i = body(value, ["unitId", "productId", "minimumStock", "idealStock"]);
    return this.inventory.settings(raw, {
      unitId: uuid(i.unitId),
      productId: uuid(i.productId),
      minimumStock: decimal(i.minimumStock, 3),
      idealStock: decimal(i.idealStock, 3),
    });
  }
}

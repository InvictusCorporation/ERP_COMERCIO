import {
  Controller,
  Get,
  Req,
  Query,
  Param,
  Inject,
  UseFilters,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../identity/auth.service";
import { AuthExceptionFilter, uuid } from "../identity/auth.controller";
import { AuditService } from "./audit.service";
import { auditFilters } from "./filters";
import { UnauthorizedException } from "@nestjs/common";
@Controller("audit")
@UseFilters(AuthExceptionFilter)
export class AuditController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private raw(r: Request) {
    const token = this.auth.tokenFromCookies(r.headers.cookie);
    if (!token)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return token;
  }
  @Get("events") list(@Req() r: Request, @Query() q: Record<string, unknown>) {
    return this.audit.list(this.raw(r), auditFilters(q));
  }
  @Get("events/:id") detail(
    @Req() r: Request,
    @Param("id") id: string,
    @Query() q: Record<string, unknown>,
  ) {
    const filter = auditFilters(q);
    return this.audit.detail(this.raw(r), filter.scope, uuid(id));
  }
}

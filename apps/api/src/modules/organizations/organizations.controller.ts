import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
  Inject,
  HttpCode,
  UseFilters,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { UNIT_KINDS, type UnitKind } from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
import {
  AuthExceptionFilter,
  body,
  text,
  uuid,
  email,
} from "../identity/auth.controller";
import { csrfToken, equalSecret } from "../identity/crypto";
import { cnpj, STATES } from "./validation";
import { OrganizationsService } from "./organizations.service";
const field = (v: unknown, max: number, required = false) => {
  if ((v === undefined || v === "") && !required) return "";
  const result = text(v, max).trim();
  if (!result && required)
    throw new BadRequestException("Preencha os campos obrigatórios.");
  return result;
};
function address(i: Record<string, unknown>) {
  const state = field(i.state, 2).toUpperCase();
  if (state && !STATES.includes(state))
    throw new BadRequestException("UF inválida.");
  const postalCode = field(i.postalCode, 9).replace("-", "");
  if (postalCode && !/^\d{8}$/.test(postalCode))
    throw new BadRequestException("CEP deve conter oito dígitos.");
  return {
    address: field(i.address, 240),
    city: field(i.city, 100),
    state,
    postalCode,
  };
}
function active(v: unknown) {
  if (typeof v !== "boolean")
    throw new BadRequestException("Situação inválida.");
  return v;
}
function code(v: unknown) {
  const result = field(v, 24, true).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(result))
    throw new BadRequestException(
      "Código: use letras, números, hífen ou sublinhado, até 24 caracteres.",
    );
  return result;
}
@Controller("organizations")
@UseFilters(AuthExceptionFilter)
export class OrganizationsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OrganizationsService) private readonly org: OrganizationsService,
  ) {}
  private raw(r: Request) {
    const raw = this.auth.tokenFromCookies(r.headers.cookie);
    if (!raw)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return raw;
  }
  private mutation(r: Request) {
    if (
      r.headers.origin !== this.auth.config.origin ||
      r.headers["sec-fetch-site"] === "cross-site" ||
      !r.is("application/json")
    )
      throw new ForbiddenException("Origem da solicitação inválida.");
    const raw = this.raw(r);
    const supplied = r.headers["x-csrf-token"];
    if (
      typeof supplied !== "string" ||
      !equalSecret(supplied, csrfToken(raw, this.auth.config.encryptionKey))
    )
      throw new ForbiddenException(
        "Solicitação de segurança inválida. Atualize a página.",
      );
    return raw;
  }
  @Get("overview") overview(@Req() r: Request) {
    return this.org.overview(this.raw(r));
  }
  @Get("units/:id") unit(@Req() r: Request, @Param("id") id: string) {
    return this.org.unit(this.raw(r), uuid(id));
  }
  @Post("companies/save") @HttpCode(200) saveCompany(
    @Req() r: Request,
    @Body() value: unknown,
  ) {
    const raw = this.mutation(r);
    const i = body(value, [
      "id",
      "legalName",
      "tradeName",
      "cnpj",
      "matrixCode",
      "stateRegistration",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "postalCode",
      "active",
    ]);
    return this.org.saveCompany(raw, {
      ...(i.id === undefined ? {} : { id: uuid(i.id) }),
      legalName: field(i.legalName, 160, true),
      tradeName: field(i.tradeName, 120, true),
      cnpj: cnpj(text(i.cnpj, 24)),
      matrixCode: code(i.matrixCode),
      stateRegistration: field(i.stateRegistration, 30),
      email: i.email ? email(i.email) : "",
      phone: field(i.phone, 30),
      ...address(i),
      active: active(i.active),
    });
  }
  @Post("units/save") @HttpCode(200) saveUnit(
    @Req() r: Request,
    @Body() value: unknown,
  ) {
    const raw = this.mutation(r);
    const i = body(value, [
      "id",
      "companyId",
      "parentId",
      "kind",
      "code",
      "name",
      "cnpj",
      "address",
      "city",
      "state",
      "postalCode",
      "active",
    ]);
    if (typeof i.kind !== "string" || !Object.hasOwn(UNIT_KINDS, i.kind))
      throw new BadRequestException("Tipo de unidade inválido.");
    return this.org.saveUnit(raw, {
      ...(i.id === undefined ? {} : { id: uuid(i.id) }),
      companyId: uuid(i.companyId),
      parentId: i.parentId === null ? null : uuid(i.parentId),
      kind: i.kind as UnitKind,
      code: code(i.code),
      name: field(i.name, 120, true),
      cnpj: i.cnpj ? cnpj(text(i.cnpj, 24)) : null,
      ...address(i),
      active: active(i.active),
    });
  }
}

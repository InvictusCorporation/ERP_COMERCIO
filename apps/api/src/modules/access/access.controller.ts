import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Inject,
  HttpCode,
  UseFilters,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { PERMISSIONS, type Permission } from "@invictus/contracts";
import { AuthService } from "../identity/auth.service";
import {
  AuthExceptionFilter,
  body,
  text,
  email,
  uuid,
  passwordText,
} from "../identity/auth.controller";
import { equalSecret, csrfToken } from "../identity/crypto";
import { parseScope } from "../organizations/unit-scope";
import { AccessService } from "./access.service";
@Controller("access")
@UseFilters(AuthExceptionFilter)
export class AccessController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(AccessService)
    private readonly access: AccessService,
  ) {}
  private raw(r: Request) {
    const raw = this.auth.tokenFromCookies(r.headers.cookie);
    if (!raw)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return raw;
  }
  private async mutation(r: Request, authenticated = true) {
    if (
      r.headers.origin !== this.auth.config.origin ||
      r.headers["sec-fetch-site"] === "cross-site" ||
      !r.is("application/json")
    )
      throw new ForbiddenException("Origem da solicitação inválida.");
    if (!authenticated) return;
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
  @Get("overview")
  overview(
    @Req()
    r: Request,
  ) {
    return this.access.overview(this.raw(r));
  }
  @Post("invitations")
  @HttpCode(200)
  async invite(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    const raw = (await this.mutation(r))!;
    const i = body(v, ["email", "name", "roleId", "allUnits", "unitIds"]);
    return this.access.invite(raw, {
      email: email(i.email),
      name: text(i.name, 120).trim() || "Usuário",
      roleId: uuid(i.roleId),
      scope: parseScope(i.allUnits, i.unitIds),
    });
  }
  @Post("invitations/revoke")
  @HttpCode(200)
  async revoke(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    const raw = (await this.mutation(r))!;
    const i = body(v, ["id"]);
    return this.access.revokeInvite(raw, uuid(i.id));
  }
  @Post("members/change")
  @HttpCode(200)
  async change(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    const raw = (await this.mutation(r))!;
    const i = body(v, ["id", "roleId", "active", "allUnits", "unitIds"]);
    if (typeof i.active !== "boolean")
      throw new BadRequestException("Situação inválida.");
    return this.access.changeMember(
      raw,
      uuid(i.id),
      uuid(i.roleId),
      i.active,
      parseScope(i.allUnits, i.unitIds),
    );
  }
  @Post("roles/save")
  @HttpCode(200)
  async role(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    const raw = (await this.mutation(r))!;
    const i = body(v, ["id", "name", "permissions"]);
    if (
      !Array.isArray(i.permissions) ||
      i.permissions.length > PERMISSIONS.length ||
      i.permissions.some((p) => !PERMISSIONS.some((valid) => valid.key === p))
    )
      throw new BadRequestException("Permissões inválidas.");
    const name = text(i.name, 80).trim();
    if (!name || /master|invictus systems/i.test(name))
      throw new BadRequestException("Nome de perfil reservado ou inválido.");
    return this.access.saveRole(
      raw,
      i.id === undefined ? undefined : uuid(i.id),
      name,
      [...new Set(i.permissions)] as Permission[],
    );
  }
  private token(v: unknown) {
    const t = text(v, 64);
    if (!/^[a-f0-9]{64}$/.test(t))
      throw new BadRequestException(
        "Convite inválido, expirado ou indisponível.",
      );
    return t;
  }
  @Post("invitations/preview")
  @HttpCode(200)
  async preview(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    await this.mutation(r, false);
    const i = body(v, ["token"]);
    return this.access.preview(this.token(i.token), r.ip || "unknown");
  }
  @Post("invitations/accept")
  @HttpCode(200)
  async accept(
    @Body()
    v: unknown,
    @Req()
    r: Request,
  ) {
    await this.mutation(r, false);
    const raw = this.auth.tokenFromCookies(r.headers.cookie);
    if (raw) await this.mutation(r);
    const i = body(v, ["token", "password"]);
    return this.access.accept(
      this.token(i.token),
      i.password === undefined ? undefined : passwordText(i.password),
      raw,
      r.ip || "unknown",
    );
  }
}

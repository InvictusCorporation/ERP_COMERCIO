import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Inject,
  HttpCode,
  UseFilters,
  Catch,
  HttpException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { csrfToken, equalSecret } from "./crypto";

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const message =
      error instanceof HttpException
        ? error.message
        : "Serviço de acesso indisponível. Tente novamente em instantes.";
    if (status === 429) response.setHeader("Retry-After", "300");
    response.status(status).json({ statusCode: status, message });
  }
}
export function body(value: unknown, allowed: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new BadRequestException("Dados de acesso inválidos.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 128) {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new BadRequestException("Confira os campos informados.");
  return value;
}
export function email(value: unknown) {
  const result = text(value, 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new BadRequestException("Informe um e-mail válido.");
  return result;
}
export function passwordText(value: unknown) {
  if (
    typeof value !== "string" ||
    Array.from(value).length === 0 ||
    Array.from(value).length > 128
  )
    throw new BadRequestException("Confira a senha informada.");
  return value;
}
export function uuid(value: unknown) {
  const result = text(value, 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      result,
    )
  )
    throw new BadRequestException("Identificador inválido.");
  return result;
}

@Controller("auth")
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private raw(request: Request) {
    const token = this.auth.tokenFromCookies(request.headers.cookie);
    if (!token)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return token;
  }
  private async mutation(request: Request, authenticated = true) {
    if (
      request.headers.origin !== this.auth.config.origin ||
      request.headers["sec-fetch-site"] === "cross-site" ||
      !request.is("application/json")
    )
      throw new ForbiddenException("Origem da solicitação inválida.");
    if (!authenticated) return "";
    const raw = this.raw(request);
    await this.auth.session(raw);
    const supplied = request.headers["x-csrf-token"];
    if (
      typeof supplied !== "string" ||
      !equalSecret(supplied, csrfToken(raw, this.auth.config.encryptionKey))
    )
      throw new ForbiddenException(
        "Solicitação de segurança inválida. Atualize a página.",
      );
    return raw;
  }
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.mutation(request, false);
    const input = body(value, ["email", "password"]);
    const result = await this.auth.login(
      email(input.email),
      passwordText(input.password),
      request.ip || "unknown",
      request.get("user-agent") || "Cliente não identificado",
      this.auth.tokenFromCookies(request.headers.cookie),
    );
    const session = await this.auth.session(result.token);
    response.setHeader("Set-Cookie", this.auth.cookie(result.token));
    return session;
  }
  @Get("session")
  async session(@Req() request: Request) {
    return this.auth.session(this.raw(request));
  }
  @Post("logout")
  @HttpCode(200)
  async logout(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    body(value, []);
    await this.mutation(request, false);
    try {
      const raw = await this.mutation(request);
      await this.auth.logout(raw);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    response.setHeader("Set-Cookie", this.auth.cookie("", true));
    return { ok: true };
  }
  @Get("sessions")
  async sessions(@Req() request: Request) {
    return this.auth.sessions(this.raw(request));
  }
  @Post("sessions/revoke")
  @HttpCode(200)
  async revoke(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = body(value, ["sessionId"]);
    const raw = await this.mutation(request);
    const current = await this.auth.revoke(raw, uuid(input.sessionId));
    if (current) response.setHeader("Set-Cookie", this.auth.cookie("", true));
    return { ok: true, current };
  }
  @Post("sessions/revoke-all")
  @HttpCode(200)
  async revokeAll(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    body(value, []);
    const raw = await this.mutation(request);
    await this.auth.revoke(raw);
    response.setHeader("Set-Cookie", this.auth.cookie("", true));
    return { ok: true };
  }
  @Post("context")
  @HttpCode(200)
  async context(@Body() value: unknown, @Req() request: Request) {
    const input = body(value, ["tenantId"]);
    const raw = await this.mutation(request);
    await this.auth.selectTenant(raw, uuid(input.tenantId));
    return this.auth.session(raw);
  }
  @Post("mfa/enroll")
  @HttpCode(200)
  async enroll(@Body() value: unknown, @Req() request: Request) {
    const input = body(value, ["password"]);
    const raw = await this.mutation(request);
    return this.auth.enroll(
      raw,
      input.password === undefined ? undefined : passwordText(input.password),
    );
  }
  @Post("mfa/verify")
  @HttpCode(200)
  async verify(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = body(value, ["code"]);
    const raw = await this.mutation(request);
    const token = await this.auth.verifyMfa(
      raw,
      text(input.code, 6),
      request.ip || "unknown",
    );
    const session = await this.auth.session(token);
    response.setHeader("Set-Cookie", this.auth.cookie(token));
    return session;
  }
  @Post("forgot-password")
  @HttpCode(202)
  async forgot(@Body() value: unknown, @Req() request: Request) {
    await this.mutation(request, false);
    const input = body(value, ["email"]);
    await this.auth.forgot(email(input.email), request.ip || "unknown");
    return {
      message:
        "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.",
    };
  }
  @Post("reset-password")
  @HttpCode(200)
  async reset(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.mutation(request, false);
    const input = body(value, ["token", "password", "code"]);
    const token = text(input.token, 64);
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new BadRequestException("Link inválido ou expirado.");
    await this.auth.reset(
      token,
      passwordText(input.password),
      input.code === undefined ? "" : text(input.code, 6),
      request.ip || "unknown",
    );
    response.setHeader("Set-Cookie", this.auth.cookie("", true));
    return { ok: true };
  }
}

import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Req, UnauthorizedException, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity/auth.service';
import { AuthExceptionFilter } from '../identity/auth.controller';
import { csrfToken, equalSecret } from '../identity/crypto';
import { draftInput } from './validation';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@UseFilters(AuthExceptionFilter)
export class AssistantController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AssistantService) private readonly service: AssistantService) {}
  private token(r: Request) {
    const raw = this.auth.tokenFromCookies(r.headers.cookie);
    if (!raw) throw new UnauthorizedException('Entre novamente.');
    return raw;
  }
  @Get('overview') overview(@Req() r: Request) { return this.service.overview(this.token(r)); }
  @Post('draft') @HttpCode(200)
  prepare(@Req() r: Request, @Body() input: unknown) {
    const raw = this.token(r), supplied = r.headers['x-csrf-token'];
    if (r.headers.origin !== this.auth.config.origin || r.headers['sec-fetch-site'] === 'cross-site' || !r.is('application/json') ||
        typeof supplied !== 'string' || !equalSecret(supplied, csrfToken(raw, this.auth.config.encryptionKey)))
      throw new ForbiddenException('Atualize a página para preparar a pergunta com segurança.');
    return this.service.prepare(raw, draftInput(input));
  }
}

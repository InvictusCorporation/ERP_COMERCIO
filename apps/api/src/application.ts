import "reflect-metadata";
import { auditRequestMiddleware } from "./modules/audit/request-context";
import { NestFactory } from "@nestjs/core";
import type { Type } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { HttpException, type ArgumentsHost } from "@nestjs/common";

export async function createApplication(
  module: Type<unknown> | DynamicModule,
  logger: false | undefined = undefined,
) {
  const app = await NestFactory.create<NestExpressApplication>(module, {
    logger,
    bodyParser: false,
  });
  app.use(auditRequestMiddleware);
  app.useBodyParser("json", { limit: "16kb" });
  app.useGlobalFilters({
    catch(error: unknown, host: ArgumentsHost) {
      const response = host.switchToHttp().getResponse();
      const external = error as { status?: number; type?: string };
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : external?.status === 400
            ? 400
            : external?.status === 413
              ? 413
              : 500;
      if (status === 400 || status === 413) {
        response.status(status).json({
          statusCode: status,
          message:
            status === 413
              ? "Solicitação muito grande."
              : "Solicitação inválida.",
        });
        return;
      }
      response.status(status).json(
        error instanceof HttpException
          ? error.getResponse()
          : {
              statusCode: 500,
              message: "Serviço temporariamente indisponível.",
            },
      );
    },
  });
  app.setGlobalPrefix("api/v1");
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(
    (
      _req: unknown,
      res: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
  );
  return app;
}

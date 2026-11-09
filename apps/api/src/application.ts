import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { Type } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";

export async function createApplication(
  module: Type<unknown> | DynamicModule,
  logger: false | undefined = undefined,
) {
  const app = await NestFactory.create(module, { logger });
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

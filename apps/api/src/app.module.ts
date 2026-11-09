import { Module, type DynamicModule } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./modules/identity/auth.controller";
import {
  AuthService,
  type MailDelivery,
} from "./modules/identity/auth.service";
import type { AuthConfig } from "./modules/identity/auth-config";

@Module({})
export class AppModule {
  static register(
    databaseUrl: string,
    authConfig?: AuthConfig,
    mailDelivery?: MailDelivery,
  ): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ...(authConfig ? [AuthController] : [])],
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => new DatabaseService(databaseUrl),
        },
        ...(authConfig
          ? [
              {
                provide: AuthService,
                useFactory: () => new AuthService(authConfig, mailDelivery),
              },
            ]
          : []),
      ],
    };
  }
}

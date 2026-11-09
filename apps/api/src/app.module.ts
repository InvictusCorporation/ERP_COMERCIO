import { InventoryService } from "./modules/inventory/inventory.service";
import { InventoryController } from "./modules/inventory/inventory.controller";
import { Module, type DynamicModule } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./modules/identity/auth.controller";
import {
  AuthService,
  type MailDelivery,
} from "./modules/identity/auth.service";
import type { AuthConfig } from "./modules/identity/auth-config";
import { AccessService } from "./modules/access/access.service";
import { AccessController } from "./modules/access/access.controller";

import { OrganizationsService } from "./modules/organizations/organizations.service";
import { OrganizationsController } from "./modules/organizations/organizations.controller";

import { AuditService } from "./modules/audit/audit.service";
import { AuditController } from "./modules/audit/audit.controller";

@Module({})
export class AppModule {
  static register(
    databaseUrl: string,
    authConfig?: AuthConfig,
    mailDelivery?: MailDelivery,
  ): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        ...(authConfig
          ? [
              AuthController,
              AccessController,
              OrganizationsController,
              AuditController,
              InventoryController,
            ]
          : []),
      ],
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => new DatabaseService(databaseUrl),
        },
        ...(authConfig
          ? [
              {
                provide: InventoryService,
                useFactory: (auth: AuthService) => new InventoryService(auth),
                inject: [AuthService],
              },
              {
                provide: AuditService,
                useFactory: (auth: AuthService) => new AuditService(auth),
                inject: [AuthService],
              },
              {
                provide: OrganizationsService,
                useFactory: (auth: AuthService) =>
                  new OrganizationsService(auth),
                inject: [AuthService],
              },
              {
                provide: AccessService,
                useFactory: (auth: AuthService) => new AccessService(auth),
                inject: [AuthService],
              },
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

import {FinanceService} from "./modules/finance/finance.service";
import {FinanceController} from "./modules/finance/finance.controller";
import {PosService} from "./modules/pos/pos.service";
import {PosController} from "./modules/pos/pos.controller";
import { PurchasingService } from "./modules/purchasing/purchasing.service";
import { PurchasingController } from "./modules/purchasing/purchasing.controller";
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
              PurchasingController, PosController, FinanceController,
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
                provide: FinanceService,useFactory:(auth:AuthService)=>new FinanceService(auth),inject:[AuthService],
              },{
                provide: PosService,useFactory:(auth:AuthService)=>new PosService(auth),inject:[AuthService],
              },{
                provide: PurchasingService,
                useFactory: (auth: AuthService) => new PurchasingService(auth),
                inject: [AuthService],
              },
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

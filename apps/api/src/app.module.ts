import {CrmService} from './modules/crm/crm.service';
import {CrmController} from './modules/crm/crm.controller';
import {NetworkService} from './modules/network/network.service';
import {NetworkController} from './modules/network/network.controller';
import {SupermarketService} from './modules/supermarket/supermarket.service';
import {SupermarketController} from './modules/supermarket/supermarket.controller';
import {LotsService} from "./modules/lots/lots.service";
import {LotsController} from "./modules/lots/lots.controller";
import {FiscalService} from "./modules/fiscal/fiscal.service";
import {FiscalController} from "./modules/fiscal/fiscal.controller";
import type {FiscalGateway} from "./modules/fiscal/focus.gateway";
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
    fiscalGateway?: FiscalGateway,
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
              PurchasingController, PosController, FinanceController, FiscalController, LotsController, SupermarketController, NetworkController, CrmController,
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
                provide: CrmService, inject: [AuthService], useFactory: (auth:AuthService)=>new CrmService(auth),
}, {
provide: NetworkService,useFactory:(auth:AuthService)=>new NetworkService(auth),inject:[AuthService],
              },{
                provide: SupermarketService,useFactory:(auth:AuthService)=>new SupermarketService(auth),inject:[AuthService],
              },{
                provide: LotsService,useFactory:(auth:AuthService)=>new LotsService(auth),inject:[AuthService],
              },{
                provide: FiscalService,useFactory:(auth:AuthService)=>new FiscalService(auth,fiscalGateway),inject:[AuthService],
              },{
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

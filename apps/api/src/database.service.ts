import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { TenantDatabase } from "./database/tenant-database";

@Injectable()
export class DatabaseService
  extends TenantDatabase
  implements OnApplicationShutdown
{
  constructor(databaseUrl: string) {
    super(databaseUrl);
  }
  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}

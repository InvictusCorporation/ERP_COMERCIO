import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 1500,
      query_timeout: 1500,
      statement_timeout: 1500,
    });
    // Readiness consulta disponibilidade sem registrar host, credenciais ou erro do driver.
    this.pool.on("error", () => {});
  }
  async isAvailable(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

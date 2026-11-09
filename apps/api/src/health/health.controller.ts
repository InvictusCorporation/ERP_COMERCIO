import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  Optional,
} from "@nestjs/common";
import type { LivenessResponse, ReadinessResponse } from "@invictus/contracts";
import { DatabaseService } from "../database.service";
import { AuthService } from "../modules/identity/auth.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService)
    private readonly database: Pick<DatabaseService, "isAvailable">,
    @Optional()
    @Inject(AuthService)
    private readonly auth?: Pick<AuthService, "isAvailable">,
  ) {}
  @Get("live")
  live(): LivenessResponse {
    return { status: "ok", service: "invictus-api" };
  }
  @Get("ready")
  async ready(): Promise<ReadinessResponse> {
    const available =
      (await this.database.isAvailable()) &&
      (!this.auth || (await this.auth.isAvailable()));
    const response: ReadinessResponse = {
      status: available ? "ready" : "not_ready",
      checks: { database: available ? "up" : "down" },
    };
    if (!available) throw new ServiceUnavailableException(response);
    return response;
  }
}

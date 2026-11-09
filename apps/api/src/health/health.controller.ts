import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { LivenessResponse, ReadinessResponse } from "@invictus/contracts";
import { DatabaseService } from "../database.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService)
    private readonly database: Pick<DatabaseService, "isAvailable">,
  ) {}
  @Get("live")
  live(): LivenessResponse {
    return { status: "ok", service: "invictus-api" };
  }
  @Get("ready")
  async ready(): Promise<ReadinessResponse> {
    const available = await this.database.isAvailable();
    const response: ReadinessResponse = {
      status: available ? "ready" : "not_ready",
      checks: { database: available ? "up" : "down" },
    };
    if (!available) throw new ServiceUnavailableException(response);
    return response;
  }
}

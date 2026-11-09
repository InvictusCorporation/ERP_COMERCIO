export type LivenessResponse = { status: "ok"; service: "invictus-api" };
export type { AuthSession, SessionStage, SessionEntry } from "./auth";
export * from "./access";
export type ReadinessResponse = {
  status: "ready" | "not_ready";
  checks: { database: "up" | "down" };
};

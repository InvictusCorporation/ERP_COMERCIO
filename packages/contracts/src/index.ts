export type LivenessResponse = { status: "ok"; service: "invictus-api" };
export type ReadinessResponse = {
  status: "ready" | "not_ready";
  checks: { database: "up" | "down" };
};

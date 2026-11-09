import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
const context = new AsyncLocalStorage<{ requestId: string }>();
export const auditRequestId = () =>
  context.getStore()?.requestId || randomUUID();
export function auditRequestMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  context.run({ requestId }, next);
}

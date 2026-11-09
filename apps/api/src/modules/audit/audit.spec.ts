import { test } from "node:test";
import assert from "node:assert/strict";
import { auditFilters } from "./filters";
import { auditRequestMiddleware, auditRequestId } from "./request-context";
test("filtros da auditoria validam datas reais, limites e lista de campos", () => {
  assert.equal(
    auditFilters({
      scope: "personal",
      from: "2024-02-29",
      page: "2",
      pageSize: "10",
    }).page,
    2,
  );
  for (const input of [
    { from: "2025-02-29" },
    { from: "0000-01-01" },
    { page: "-1" },
    { pageSize: "51" },
    { unitId: "other" },
    { tenantId: "injected" },
    { actor: ["a", "b"] },
    { scope: "other" },
  ])
    assert.throws(() => auditFilters(input));
});
test("correlação é gerada pelo servidor e preservada na cadeia assíncrona", async () => {
  const seen: string[] = [];
  await Promise.all(
    [0, 1].map(
      () =>
        new Promise<void>((resolve, reject) => {
          const res = {
            setHeader: (_name: string, value: string) => seen.push(value),
          };
          auditRequestMiddleware(
            { headers: { "x-request-id": "untrusted" } } as any,
            res as any,
            () => {
              const first = auditRequestId();
              setTimeout(() => {
                try {
                  assert.equal(auditRequestId(), first);
                  assert.notEqual(first, "untrusted");
                  resolve();
                } catch (e) {
                  reject(e);
                }
              }, 2);
            },
          );
        }),
    ),
  );
  assert.equal(new Set(seen).size, 2);
});

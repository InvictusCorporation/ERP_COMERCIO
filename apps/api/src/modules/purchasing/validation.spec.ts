import { test } from "node:test";
import assert from "node:assert/strict";
import { date, version, purchaseInput, receiveInput } from "./validation";
test("previsão aceita calendário real e recusa ano zero e datas normalizadas", () => {
  assert.equal(date("2028-02-29"), "2028-02-29");
  assert.equal(date(""), "");
  for (const v of [
    "0000-01-01",
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "01/12/2026",
  ])
    assert.throws(() => date(v));
});
test("versão e paginação não aceitam coerção ou infinito", () => {
  assert.equal(version(1), 1);
  for (const v of [0, -1, "1", NaN, Infinity, 2147483647])
    assert.throws(() => version(v));
});
test("compras e conferências recusam itens ausentes e identidade forjada", () => {
  assert.throws(() => purchaseInput({ items: [] }));
  assert.throws(() => receiveInput({ items: [] }));
  assert.throws(() => purchaseInput({ tenantId: "forjado" }));
  assert.throws(() => receiveInput({ actorId: "forjado" }));
});

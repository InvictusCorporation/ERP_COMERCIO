import { test } from "node:test";
import assert from "node:assert/strict";
import { gtin, decimal, movementInput } from "./validation";
test("GTIN verifica comprimentos e dígito sem perder zeros", () => {
  assert.equal(gtin("4006381333931"), "4006381333931");
  assert.equal(gtin("04006381333931"), "04006381333931");
  for (const s of ["4006381333932", "00000000", "123456789", "abcdef1234567"])
    assert.throws(() => gtin(s));
});
test("decimais preservam texto exato e recusam coerção, infinito e precisão excessiva", () => {
  assert.equal(decimal("0.125", 3), "0.125");
  assert.equal(decimal("3.50", 2), "3.50");
  for (const v of [
    NaN,
    1,
    null,
    "NaN",
    "Infinity",
    "1e3",
    "1,2",
    "-1",
    "1.2345",
    " 1",
  ])
    assert.throws(() => decimal(v, 3));
  assert.throws(() => decimal("0", 3, 999, true));
});
test("movimento não aceita campos de identidade ou saldos forjados", () => {
  assert.throws(() => movementInput({ kind: "entry", actorId: "forjado" }));
  assert.throws(() => movementInput({ kind: "desconhecido" }));
});

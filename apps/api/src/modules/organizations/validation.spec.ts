import { test } from "node:test";
import assert from "node:assert/strict";
import { validCnpj, normalizeCnpj } from "./validation";
test("CNPJ aceita formato numérico e o exemplo alfanumérico oficial sem apagar letras", () => {
  assert.equal(validCnpj("11.222.333/0001-81"), true);
  assert.equal(validCnpj("12.ABC.345/01DE-35"), true);
  assert.equal(normalizeCnpj(" 12.abc.345/01de-35 "), "12ABC34501DE35");
  assert.equal(validCnpj("12abc34501de35"), true);
});
test("CNPJ recusa dígitos adulterados, letras nos DVs, símbolos e sequências repetidas", () => {
  for (const value of [
    "12ABC34501DE36",
    "12ABC34501DE3A",
    "12ABC34501DE",
    "00000000000000",
    "11111111111111",
    "12@BC34501DE35",
  ])
    assert.equal(validCnpj(value), false, value);
});

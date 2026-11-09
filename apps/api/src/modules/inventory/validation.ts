import { BadRequestException } from "@nestjs/common";
import {
  BASE_UNITS,
  type ProductInput,
  type MovementInput,
  MOVEMENT_KINDS,
} from "@invictus/contracts";
import { body, text, uuid } from "../identity/auth.controller";
export function decimal(
  value: unknown,
  scale: number,
  max = 999999999,
  positive = false,
): string {
  if (
    typeof value !== "string" ||
    !new RegExp("^\\d{1,9}(?:\\.\\d{1," + scale + "})?$").test(value) ||
    Number(value) > max ||
    (positive ? Number(value) <= 0 : Number(value) < 0)
  )
    throw new BadRequestException(
      "Valor numérico inválido. Use ponto decimal, sem separador de milhar.",
    );
  return value;
}
const field = (v: unknown, max: number, required = false) => {
  if (!required && (v === undefined || v === "")) return "";
  const s = text(v, max).trim();
  if (required && !s)
    throw new BadRequestException("Preencha os campos obrigatórios.");
  return s;
};
function bool(v: unknown) {
  if (typeof v !== "boolean")
    throw new BadRequestException("Situação inválida.");
  return v;
}
export function gtin(value: unknown): string {
  const s = text(value, 14);
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(s) || /^0+$/.test(s))
    throw new BadRequestException("GTIN deve ter 8, 12, 13 ou 14 dígitos.");
  let sum = 0;
  for (let i = s.length - 2, j = 0; i >= 0; i--, j++)
    sum += Number(s[i]) * (j % 2 ? 1 : 3);
  if ((10 - (sum % 10)) % 10 !== Number(s.at(-1)))
    throw new BadRequestException(
      "Dígito verificador do código de barras inválido.",
    );
  return s;
}
export function productInput(value: unknown): ProductInput {
  const i = body(value, [
    "id",
    "version",
    "code",
    "name",
    "description",
    "category",
    "brand",
    "baseUnit",
    "packageName",
    "packageFactor",
    "barcodes",
    "salePrice",
    "desiredMargin",
    "minimumMargin",
    "minimumStock",
    "idealStock",
    "active",
  ]);
  const code = field(i.code, 32, true).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code))
    throw new BadRequestException("Código interno inválido.");
  if (!BASE_UNITS.includes(i.baseUnit as any))
    throw new BadRequestException("Unidade-base inválida.");
  if (!Array.isArray(i.barcodes) || i.barcodes.length > 20)
    throw new BadRequestException("Informe até vinte códigos de barras.");
  const barcodes = i.barcodes.map(gtin);
  if (new Set(barcodes).size !== barcodes.length)
    throw new BadRequestException("Código de barras repetido.");
  if (
    i.id !== undefined &&
    (!Number.isInteger(i.version) || Number(i.version) < 1)
  )
    throw new BadRequestException("Versão inválida.");
  const result: ProductInput = {
    ...(i.id !== undefined
      ? { id: uuid(i.id), version: Number(i.version) }
      : {}),
    code,
    name: field(i.name, 160, true),
    description: field(i.description, 2000),
    category: field(i.category, 80),
    brand: field(i.brand, 80),
    baseUnit: i.baseUnit as ProductInput["baseUnit"],
    packageName: field(i.packageName, 40),
    packageFactor: decimal(i.packageFactor, 3, 999999, true),
    barcodes,
    salePrice: decimal(i.salePrice, 2),
    desiredMargin: decimal(i.desiredMargin, 2, 99.99),
    minimumMargin: decimal(i.minimumMargin, 2, 99.99),
    minimumStock: decimal(i.minimumStock, 3),
    idealStock: decimal(i.idealStock, 3),
    active: bool(i.active),
  };
  if (Number(result.idealStock) < Number(result.minimumStock))
    throw new BadRequestException(
      "Estoque ideal deve ser maior ou igual ao mínimo.",
    );
  return result;
}
export function movementInput(value: unknown): MovementInput {
  const i = body(value, [
    "unitId",
    "productId",
    "kind",
    "quantity",
    "packaged",
    "cost",
    "reason",
    "reversalOf",
    "requestKey",
  ]);
  if (typeof i.kind !== "string" || !Object.hasOwn(MOVEMENT_KINDS, i.kind))
    throw new BadRequestException("Tipo de movimento inválido.");
  const reason = field(i.reason, 300, true);
  if (reason.length < 3)
    throw new BadRequestException("Descreva o motivo do movimento.");
  if (i.kind === "reverse" ? !i.reversalOf : i.reversalOf !== undefined)
    throw new BadRequestException("Referência de estorno inválida.");
  return {
    unitId: uuid(i.unitId),
    productId: uuid(i.productId),
    kind: i.kind as MovementInput["kind"],
    quantity: decimal(i.quantity, 3, 999999999, true),
    packaged: bool(i.packaged),
    cost: decimal(i.cost, 6),
    reason,
    ...(i.reversalOf ? { reversalOf: uuid(i.reversalOf) } : {}),
    requestKey: uuid(i.requestKey),
  };
}

import { BadRequestException } from "@nestjs/common";
import type {
  SupplierInput,
  PurchaseInput,
  ReceiveInput,
} from "@invictus/contracts";
import { body, text, uuid, email } from "../identity/auth.controller";
import { decimal } from "../inventory/validation";
import { cnpj, STATES } from "../organizations/validation";
export const field = (v: unknown, max: number, required = false) => {
  if (!required && (v === undefined || v === "")) return "";
  const s = text(v, max).trim();
  if (required && !s)
    throw new BadRequestException("Preencha os campos obrigatórios.");
  return s;
};
export function version(v: unknown) {
  if (!Number.isInteger(v) || Number(v) < 1 || Number(v) > 2147483646)
    throw new BadRequestException("Versão inválida.");
  return Number(v);
}
export function date(v: unknown) {
  if (v === undefined || v === "") return "";
  const s = text(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    s.startsWith("0000") ||
    !Number.isFinite(Date.parse(s + "T00:00:00Z")) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw new BadRequestException("Data inválida.");
  return s;
}
export function supplierInput(v: unknown): SupplierInput {
  const i = body(v, [
    "id",
    "version",
    "legalName",
    "name",
    "cnpj",
    "stateRegistration",
    "contactName",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "postalCode",
    "deliveryDays",
    "paymentTerms",
    "notes",
    "active",
  ]);
  const state = field(i.state, 2).toUpperCase(),
    postalCode = field(i.postalCode, 9).replace("-", "");
  if (state && !STATES.includes(state))
    throw new BadRequestException("UF inválida.");
  if (postalCode && !/^\d{8}$/.test(postalCode))
    throw new BadRequestException("CEP inválido.");
  if (
    typeof i.active !== "boolean" ||
    !Number.isInteger(i.deliveryDays) ||
    Number(i.deliveryDays) < 0 ||
    Number(i.deliveryDays) > 365
  )
    throw new BadRequestException("Situação ou prazo inválido.");
  return {
    ...(i.id !== undefined
      ? { id: uuid(i.id), version: version(i.version) }
      : {}),
    legalName: field(i.legalName, 160, true),
    name: field(i.name, 120, true),
    cnpj: cnpj(text(i.cnpj, 24)),
    stateRegistration: field(i.stateRegistration, 30),
    contactName: field(i.contactName, 100),
    email: i.email ? email(i.email) : "",
    phone: field(i.phone, 30),
    address: field(i.address, 240),
    city: field(i.city, 100),
    state,
    postalCode,
    deliveryDays: Number(i.deliveryDays),
    paymentTerms: field(i.paymentTerms, 200),
    notes: field(i.notes, 1000),
    active: i.active,
  };
}
export function purchaseInput(v: unknown): PurchaseInput {
  const i = body(v, [
    "id",
    "version",
    "unitId",
    "supplierId",
    "items",
    "freight",
    "extraCost",
    "discount",
    "expectedDate",
    "notes",
    "requestKey",
  ]);
  if (!Array.isArray(i.items) || i.items.length < 1 || i.items.length > 50)
    throw new BadRequestException("Inclua de 1 a 50 produtos.");
  const seen = new Set();
  const items = i.items.map((v) => {
    const x = body(v, ["productId", "quantity", "unitCost", "packaged"]);
    const productId = uuid(x.productId);
    if (seen.has(productId) || typeof x.packaged !== "boolean")
      throw new BadRequestException("Produto repetido ou embalagem inválida.");
    seen.add(productId);
    return {
      productId,
      quantity: decimal(x.quantity, 3, 999999999, true),
      unitCost: decimal(x.unitCost, 6),
      packaged: x.packaged,
    };
  });
  return {
    ...(i.id !== undefined
      ? { id: uuid(i.id), version: version(i.version) }
      : {}),
    unitId: uuid(i.unitId),
    supplierId: uuid(i.supplierId),
    items,
    freight: decimal(i.freight, 2),
    extraCost: decimal(i.extraCost, 2),
    discount: decimal(i.discount, 2),
    expectedDate: date(i.expectedDate),
    notes: field(i.notes, 1000),
    requestKey: uuid(i.requestKey),
  };
}
export function receiveInput(v: unknown): ReceiveInput {
  const i = body(v, [
    "orderId",
    "version",
    "items",
    "document",
    "notes",
    "requestKey",
  ]);
  if (!Array.isArray(i.items) || i.items.length < 1 || i.items.length > 50)
    throw new BadRequestException("Informe as quantidades conferidas.");
  const seen = new Set();
  return {
    orderId: uuid(i.orderId),
    version: version(i.version),
    items: i.items.map((v) => {
      const x = body(v, ["lineId", "quantity"]);
      const lineId = uuid(x.lineId);
      if (seen.has(lineId)) throw new BadRequestException("Item repetido.");
      seen.add(lineId);
      return { lineId, quantity: decimal(x.quantity, 3, 999999999, true) };
    }),
    document: field(i.document, 120, true),
    notes: reason(i.notes),
    requestKey: uuid(i.requestKey),
  };
}
export function reason(v: unknown) {
  const s = field(v, 300, true);
  if (s.length < 3)
    throw new BadRequestException(
      "Descreva o motivo com pelo menos três caracteres.",
    );
  return s;
}
export function page(v: unknown) {
  if (v === undefined) return 0;
  if (typeof v !== "string" || !/^\d{1,4}$/.test(v) || Number(v) > 1000)
    throw new BadRequestException("Página inválida.");
  return Number(v);
}

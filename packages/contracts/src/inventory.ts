export const BASE_UNITS = [
  "UN",
  "KG",
  "G",
  "L",
  "ML",
  "PCT",
  "CX",
  "FD",
  "SC",
] as const;
export const MOVEMENT_KINDS = {
  entry: "Entrada",
  out: "Saída manual",
  loss: "Perda / avaria",
  reserve: "Reserva",
  release: "Liberação de reserva",
  reverse: "Estorno",
} as const;
export type MovementKind = keyof typeof MOVEMENT_KINDS;
export type ProductInput = {
  id?: string;
  version?: number;
  code: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  baseUnit: (typeof BASE_UNITS)[number];
  packageName: string;
  packageFactor: string;
  barcodes: string[];
  salePrice: string;
  desiredMargin: string;
  minimumMargin: string;
  minimumStock: string;
  idealStock: string;
  active: boolean;
};
export type Product = ProductInput & { id: string; version: number };
export type StockBalance = {
  physical: string;
  reserved: string;
  available: string;
  value: string;
  averageCost: string;
  lastCost: string;
  minimumStock: string;
  idealStock: string;
};
export type ProductRow = Product & { stock: StockBalance | null };
export type InventoryPage = {
  items: ProductRow[];
  total: number;
  page: number;
  unitId: string | null;
  canManageProducts: boolean;
  canManageStock: boolean;
  canReadStock: boolean;
  summary: { products: number; value: string; low: number; empty: number };
};
export type StockMovement = {
  id: string;
  kind: MovementKind;
  quantity: string;
  factor: string;
  baseQuantity: string;
  cost: string;
  physicalDelta: string;
  reservedDelta: string;
  valueDelta: string;
  physicalAfter: string;
  reservedAfter: string;
  valueAfter: string;
  actorName: string;
  reason: string;
  reversalOf: string | null;
  createdAt: string;
};
export type ProductDetail = {
  product: ProductRow;
  movements: StockMovement[];
  movementTotal: number;
  movementPage: number;
};
export type MovementInput = {
  unitId: string;
  productId: string;
  kind: MovementKind;
  quantity: string;
  packaged: boolean;
  cost: string;
  reason: string;
  reversalOf?: string;
  requestKey: string;
};

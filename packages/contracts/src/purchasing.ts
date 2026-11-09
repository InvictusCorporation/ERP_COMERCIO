export const PURCHASE_STATUSES = {
  draft: "Rascunho",
  approved: "Aprovado",
  partial: "Recebido parcialmente",
  received: "Recebido",
  cancelled: "Cancelado",
} as const;
export type SupplierInput = {
  id?: string;
  version?: number;
  legalName: string;
  name: string;
  cnpj: string;
  stateRegistration: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryDays: number;
  paymentTerms: string;
  notes: string;
  active: boolean;
};
export type Supplier = SupplierInput & { id: string; version: number };
export type PurchaseItemInput = {
  productId: string;
  quantity: string;
  unitCost: string;
  packaged: boolean;
};
export type PurchaseInput = {
  id?: string;
  version?: number;
  unitId: string;
  supplierId: string;
  items: PurchaseItemInput[];
  freight: string;
  extraCost: string;
  discount: string;
  expectedDate: string;
  notes: string;
  requestKey: string;
};
export type PurchaseItem = PurchaseItemInput & {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  packageName: string;
  factor: string;
  baseQuantity: string;
  baseValue: string;
  totalValue: string;
  receivedQuantity: string;
  receivedValue: string;
};
export type Purchase = {
  id: string;
  number: string;
  version: number;
  unitId: string;
  unitName: string;
  supplierId: string;
  supplier: {
    name: string;
    legalName: string;
    cnpj: string;
    paymentTerms: string;
  };
  items: PurchaseItem[];
  status: keyof typeof PURCHASE_STATUSES;
  freight: string;
  extraCost: string;
  discount: string;
  total: string;
  expectedDate: string;
  notes: string;
  cancelReason: string | null;
  actorName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};
export type PurchaseReceipt = {
  id: string;
  orderId: string;
  status: "confirmed" | "reversed";
  items: {
    lineId: string;
    productId: string;
    name: string;
    quantity: string;
    factor: string;
    baseQuantity: string;
    totalValue: string;
    movementId: string;
  }[];
  document: string;
  notes: string;
  total: string;
  actorName: string;
  createdAt: string;
  reversalReason: string | null;
  reversedBy: string | null;
  reversedAt: string | null;
};
export type PurchaseDetail = {
  order: Purchase;
  receipts: PurchaseReceipt[];
  receiptTotal: number;
  receiptPage: number;
};
export type PurchasePage = {
  items: Purchase[];
  total: number;
  page: number;
  summary: {
    draft: number;
    approved: number;
    partial: number;
    received: number;
    openValue: string;
  };
  capabilities: { manage: boolean; approve: boolean; receive: boolean };
};
export type SupplierPage = {
  items: Supplier[];
  total: number;
  page: number;
  active: number;
  canManage: boolean;
};
export type PurchaseOptions = {
  suppliers: { id: string; name: string }[];
  products: {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    packageName: string;
    packageFactor: string;
  }[];
  units: { id: string; name: string }[];
};
export type ReceiveInput = {
  orderId: string;
  version: number;
  items: { lineId: string; quantity: string }[];
  document: string;
  notes: string;
  requestKey: string;
};

export type PurchasePriceWarning = {
  id: string;
  name: string;
  averageCost: string;
  salePrice: string;
  margin: string | null;
  suggestedPrice: string;
  targetMargin: string;
};

export const SALE_STATUSES = { draft: 'Rascunho', pending: 'Pagamento pendente', confirmed: 'Confirmada', cancelled: 'Cancelada', returned: 'Devolvida' } as const;
export const PAYMENT_METHODS = { cash: 'Dinheiro', pix: 'Pix', debit: 'Débito', credit: 'Crédito' } as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export type PosProduct = {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    category: string;
    price: string;
    available: string;
    barcodes: string[];
};
export type SaleItemInput = {
    productId: string;
    quantity: string;
    expectedPrice: string;
    measurement?: import("./supermarket").WeightMeasurement;
};
export type SaleItem = {
    id: string;
    productId: string;
    code: string;
    name: string;
    baseUnit: string;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    total: string;
    stockCost: string;
    measurement?: (import("./supermarket").WeightMeasurement|{source:"manual_quantity";quantity:string}) & {quantity?:string};
};
export type Sale = {
 customerId:string|null;customer:{name:string;code:string}|null;
    id: string;
    number: string;
    unitId: string;
    registerId: string;
    operatorId: string;
    operatorName: string;
    unit: {
        companyName: string;
        unitName: string;
        unitCode: string;
        cnpj: string;
    };
    items: SaleItem[];
    gross: string;
    discount: string;
    total: string;
    status: keyof typeof SALE_STATUSES;
    version: number;
    paymentId: string | null;
    notes: string;
    reason: string | null;
    createdAt: string;
    confirmedAt: string | null;
    returnedAt: string | null;
    returnedBy: string | null;
    sandbox: true;
};
export type PosPayment = {
    id: string;
    state: 'pending' | 'authorized' | 'confirmed' | 'declined' | 'cancelled' | 'refunded';
    methods: {
        method: PaymentMethod;
        amount: string;
        tendered: string;
    }[];
    cashAmount: string;
    changeAmount: string;
    total: string;
    provider: 'local_sandbox';
    createdAt: string;
};
export type SaleDetail = {
    lotAllocations: import("./lots").SaleLot[];
    sale: Sale;
    payments: PosPayment[];
};
export type CashRegister = {
    id: string;
    unitId: string;
    code: string;
    operatorId: string;
    operatorName: string;
    openingAmount: string;
    openedAt: string;
    closedAt: string | null;
    closedBy: string | null;
    counted: string | null;
    expected: string | null;
    difference: string | null;
    notes: string;
    balance: string;
};
export type CashEntry = {
    id: string;
    kind: 'opening' | 'sale' | 'refund' | 'supply' | 'withdraw';
    amount: string;
    reason: string;
    actorName: string;
    createdAt: string;
};
export type RegisterDetail = {
    register: CashRegister;
    entries: CashEntry[];
    total: number;
    page: number;
};
export type PosOverview = {
    mode: 'sandbox';
    unitId: string | null;
    units: {
        id: string;
        name: string;
    }[];
    registers: CashRegister[];
    activeRegister: CashRegister | null;
    capabilities: {
        sell: boolean;
        cash: boolean;
        manageCash: boolean;
        discount: boolean;
        refund: boolean;
    };
    summary: {
        confirmed: number;
        pending: number;
        total: string;
        returned: string;
    };
};
export type SalePage = {
    items: Sale[];
    total: number;
    page: number;
};
export type SaveSaleInput = {
 customerId?:string;
    id?: string;
    version?: number;
    registerId: string;
    items: SaleItemInput[];
    discount: string;
    notes: string;
    requestKey: string;
};
export type BeginPaymentInput = {
    saleId: string;
    version: number;
    methods: {
        method: PaymentMethod;
        amount: string;
        tendered: string;
    }[];
    requestKey: string;
};

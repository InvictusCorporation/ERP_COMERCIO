export const TRANSFER_STATUSES = { draft: 'Rascunho', approved: 'Aprovada', in_transit: 'Em trânsito', received: 'Recebida', cancelled: 'Cancelada' } as const;
export type NetworkUnit = {
    id: string;
    name: string;
    code: string;
    kind: import('./organizations').UnitKind;
    companyId: string;
    companyName: string;
    parentId: string | null;
    stockValue: string;
    products: number;
    sales: string | null;
    profit: string | null;
    purchases: string | null;
    canManage: boolean;
    canPurchase: boolean;
};
export type NetworkOverview = {
    from: string;
    to: string;
    units: NetworkUnit[];
    summary: {
        units: number;
        stockValue: string;
        transitValue: string;
        transfers: number;
        pending: number;
    };
    canCreate: boolean;
    canPurchase: boolean;
};
export type NetworkProduct = {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    physical: string;
    available: string;
    value: string;
    units?: {
        unitId: string;
        name: string;
        physical: string;
        available: string;
        value: string;
    }[];
};
export type TransferLine = {
    id: string;
    productId: string;
    code: string;
    name: string;
    baseUnit: string;
    quantity: string;
    cost: string;
    lotTracked?: boolean;
    lots: {
        sourceLotId: string;
        code: string;
        manufacturedOn: string | null;
        expiresOn: string;
        quantity: string;
    }[];
};
export type NetworkTransfer = {
    id: string;
    number: string;
    sourceId: string;
    destinationId: string;
    status: keyof typeof TRANSFER_STATUSES;
    version: number;
    items: TransferLine[];
    unit: {
        sourceName: string;
        sourceCode: string;
        sourceKind: string;
        destinationName: string;
        destinationCode: string;
        destinationKind: string;
        companyName: string;
    };
    totalCost: string;
    reason: string;
    documentRef: string | null;
    notes: string;
    actorName: string;
    approvedBy: string | null;
    approvedAt: string | null;
    dispatchedBy: string | null;
    dispatchedAt: string | null;
    receivedBy: string | null;
    receivedAt: string | null;
    cancelledBy: string | null;
    cancelReason: string | null;
    createdAt: string;
    centralId: string | null;
    capabilities: {
        approve: boolean;
        dispatch: boolean;
        receive: boolean;
        cancel: boolean;
    };
};
export type CentralPurchase = {
    id: string;
    unitId: string;
    unitName: string;
    orderId: string;
    number: string;
    status: import('./purchasing').Purchase['status'];
    total: string;
    distributed: boolean;
    distributedAt: string | null;
    distributedBy: string | null;
    createdAt: string;
    allocations: {
        productId: string;
        name: string;
        code: string;
        baseUnit: string;
        unitId: string;
        unitName: string;
        quantity: string;
    }[];
    canDistribute: boolean;
    transfers?: NetworkTransfer[];
};
export type NetworkPage<T> = {
    items: T[];
    page: number;
    total: number;
};

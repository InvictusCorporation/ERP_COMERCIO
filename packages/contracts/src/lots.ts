export const LOT_LOSS_KINDS = { expiration: 'Vencimento', damage: 'Avaria', breakage: 'Quebra', theft: 'Furto identificado', other: 'Outra perda' } as const;
export type LotLossKind = keyof typeof LOT_LOSS_KINDS;
export type LotRow = {
    id: string;
    unitId: string;
    productId: string;
    code: string;
    productName: string;
    productCode: string;
    baseUnit: string;
    manufacturedOn: string;
    expiresOn: string;
    quantity: string;
    blocked: boolean;
    version: number;
    status: 'expired' | 'near' | 'valid' | 'blocked' | 'empty';
    alertDays: number;
};
export type LotProduct = {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    physical: string;
    reserved: string;
    allocated: string;
    unallocated: string;
    sellable: string;
    minimum: string;
    ideal: string;
    suggestion: string;
    tracking: boolean;
    alertDays: number;
    controlVersion: number | null;
};
export type LotEvent = {
    id: string;
    kind: string;
    quantityDelta: string;
    reason: string;
    actorName: string;
    createdAt: string;
    movementId: string | null;
    lossKind: LotLossKind | null;
};
export type LotDetail = {
    lot: LotRow;
    events: LotEvent[];
    page: number;
    total: number;
};
export type LotPage<T> = {
    items: T[];
    page: number;
    total: number;
};
export type LotOverview = {
    unitId: string | null;
    today: string;
    canManage: boolean;
    summary: {
        lots: number;
        expired: number;
        near: number;
        blocked: number;
        unclassifiedProducts: number;
    };
};
export type LotLoss = {
    id: string;
    lotId: string | null;
    lotCode: string | null;
    productName: string;
    baseUnit: string;
    quantity: string;
    costValue: string;
    reason: string;
    actorName: string;
    createdAt: string;
    reversed: boolean;
    lossKind: LotLossKind | null;
};
export type LotLossReport = LotPage<LotLoss> & {
    summary: {
        count: number;
        gross: string;
        reversed: string;
        net: string;
    };
};
export type LotCommand = {
    unitId: string;
    productId: string;
    action: 'allocate' | 'withdraw' | 'block' | 'unblock' | 'loss' | 'reverse' | 'settings';
    lotId?: string;
    version?: number;
    quantity: string;
    code: string;
    manufacturedOn: string;
    expiresOn: string;
    reason: string;
    lossKind: LotLossKind | '';
    movementId: string;
    alertDays: number;
    requestKey: string;
};
export type SaleLot = {
    lineId: string;
    lotId: string;
    code: string;
    expiresOn: string;
    quantity: string;
};

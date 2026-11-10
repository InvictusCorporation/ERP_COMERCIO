export const FISCAL_STATES = { draft: 'Rascunho', processing: 'Em processamento', authorized: 'Autorizado em homologação', rejected: 'Rejeitado', cancel_pending: 'Cancelamento pendente', cancelled: 'Cancelado em homologação', uncertain: 'Retorno a conciliar', discarded: 'Descartado localmente' } as const;
export type FiscalIssuerData = {
    uf: string;
    crt: '1' | '3';
    ie: string;
    municipalityCode: string;
    city: string;
    street: string;
    number: string;
    district: string;
    postalCode: string;
    reviewed: boolean;
};
export type FiscalProductData = {
    ncm: string;
    cest: string;
    cfop: string;
    origin: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
    icmsCode: '102' | '00';
    icmsRate: string;
    pisCode: '01' | '07' | '08' | '09';
    pisRate: string;
    cofinsCode: '01' | '07' | '08' | '09';
    cofinsRate: string;
    rtc: 'standard' | 'not_applicable';
    ibsCode: string;
    classification: string;
    ibsStateRate: string;
    ibsCityRate: string;
    cbsRate: string;
    reviewed: boolean;
};
export type FiscalProfile<T> = {
    id: string;
    data: T;
    version: number;
    reviewedBy: string;
};
export type FiscalRecipient = {
    name: string;
    document: string;
    ieIndicator: '1' | '2' | '9';
    ie: string;
    uf: string;
    municipalityCode: string;
    city: string;
    street: string;
    number: string;
    district: string;
    postalCode: string;
};
export type FiscalBases = {
    productId: string;
    icmsBase: string;
    pisBase: string;
    cofinsBase: string;
    ibsBase: string;
};
export type FiscalDraftInput = {
    id?: string;
    version?: number;
    saleId: string;
    model: '55' | '65';
    nature: string;
    recipient: FiscalRecipient;
    bases: FiscalBases[];
    additional: string;
    requestKey: string;
};
export type FiscalDocument = {
    id: string;
    unitId: string;
    saleId: string;
    reference: string;
    model: '55' | '65';
    environment: 'homologation';
    state: keyof typeof FISCAL_STATES;
    version: number;
    total: string;
    issuerCnpj: string;
    key: string | null;
    protocol: string | null;
    number: string | null;
    series: string | null;
    cancelProtocol: string | null;
    sefazCode: string | null;
    message: string;
    reason: string | null;
    createdAt: string;
    updatedAt: string;
    validationErrors: string[];
    artifacts: {
        xml: boolean;
        danfe: boolean;
        cancelXml: boolean;
    };
    qrUrl: string | null;
};
export type FiscalOperation = {
    id: string;
    kind: 'issue' | 'consult' | 'cancel';
    state: 'started' | 'done' | 'uncertain';
    actorName: string;
    createdAt: string;
    finishedAt: string | null;
    result: {
        state: string;
        message: string;
        sefazCode?: string;
    } | null;
};
export type FiscalSnapshot = {
    saleNumber: string;
    sandboxSource: boolean;
    issuerVersion: number | null;
    issuer: FiscalIssuerData | null;
    issuerName: string;
    recipient: FiscalRecipient;
    nature: string;
    additional: string;
    bases: FiscalBases[];
    profiles: {
        productId: string;
        version: number;
        data: FiscalProductData;
    }[];
    items: {
        id: string;
        productId: string;
        name: string;
        code: string;
        baseUnit: string;
        quantity: string;
        unitPrice: string;
        gross: string;
        discount: string;
        total: string;
        taxes: Record<string, string>;
    }[];
};
export type FiscalDetail = {
    document: FiscalDocument;
    snapshot: FiscalSnapshot;
    operations: FiscalOperation[];
};
export type FiscalOverview = {
    unitId: string | null;
    issuerCnpj: string;
    issuerName: string;
    issuer: FiscalProfile<FiscalIssuerData> | null;
    integration: {
        provider: 'focus_homologation' | 'disabled';
        ready: boolean;
        message: string;
    };
    capabilities: {
        manage: boolean;
        issue: boolean;
        cancel: boolean;
        pos: boolean;
        products: boolean;
    };
    summary: {
        draft: number;
        processing: number;
        authorized: number;
        rejected: number;
        uncertain: number;
        cancelled: number;
    };
};
export type FiscalProduct = {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
    active: boolean;
    profile: FiscalProfile<FiscalProductData> | null;
};
export type FiscalSource = {
    id: string;
    number: string;
    total: string;
    createdAt: string;
    items: {
        productId: string;
        name: string;
        quantity: string;
        unitPrice: string;
        total: string;
    }[];
};
export type FiscalPage<T> = {
    items: T[];
    total: number;
    page: number;
};

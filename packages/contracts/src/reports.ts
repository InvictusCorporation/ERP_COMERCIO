export const REPORT_PERMISSIONS = [{ key: 'reports.read', label: 'Consultar relatórios e indicadores', description: 'Consulta gerencial por filial; cada indicador exige acesso ao módulo de origem.' }, { key: 'reports.export', label: 'Exportar relatórios gerenciais', description: 'Baixar CSV dos dados autorizados com registro de auditoria; exige duas etapas.' }] as const;
export const REPORT_KINDS = { transactions: 'Vendas e devoluções', products: 'Produtos e curva ABC', units: 'Ranking de lojas', sellers: 'Ranking de responsáveis', cashflow: 'Fluxo financeiro realizado', receivables: 'Contas a receber atuais', payables: 'Contas a pagar atuais', closings: 'Conferências de caixa', stock: 'Posição atual de estoque', purchases: 'Compras recebidas por fornecedor', losses: 'Perdas e estornos de estoque' } as const;
export type ReportKind = keyof typeof REPORT_KINDS;
export type ReportFilters = {
    from?: string;
    to?: string;
    companyId?: string;
    unitId?: string;
    category?: string;
    supplierId?: string;
    source?: 'manual' | 'sandbox';
    query?: string;
    status?: 'all' | 'missing' | 'low' | 'near_expiry' | 'expired' | 'no_movement' | 'overdue';
};
export type ReportUnit = {
    id: string;
    name: string;
    companyId: string;
    companyName: string;
    kind: string;
};
export type ReportColumn = {
    key: string;
    label: string;
    type: 'text' | 'money' | 'quantity' | 'percent' | 'date' | 'integer';
};
export type ReportRow = Record<string, string | number | null>;
export type ReportPage = {
    kind: ReportKind;
    title: string;
    columns: ReportColumn[];
    items: ReportRow[];
    total: number;
    page: number;
    generatedAt: string;
    notes: string[];
};
export type SalesIndicators = {
    net: string;
    goods: string;
    delivery: string;
    gross: string;
    returns: string;
    completed: number;
    returned: number;
    cost: string | null;
    profit: string | null;
    margin: string | null;
    ticket: string | null;
    change: string | null;
    previousNet: string;
    lastDay: string;
};
export type FinanceIndicators = {
    receipts: string;
    payments: string;
    other: string;
    net: string;
    balance: string;
    receivable: string;
    payable: string;
    overdueReceivable: string;
    overduePayable: string;
    closingCount: number;
    closingDifference: string;
};
export type StockIndicators = {
    value: string;
    positions: number;
    missing: number;
    low: number;
    nearExpiry: number;
    expired: number;
    noMovement: number;
};
export type ReportsOverview = {
    from: string;
    to: string;
    today: string;
    previousFrom: string;
    previousTo: string;
    generatedAt: string;
    units: ReportUnit[];
    selectedUnitIds: string[];
    categories: string[];
    canExport: boolean;
    capabilities: {
        sales: boolean;
        cost: boolean;
        finance: boolean;
        stock: boolean;
        purchases: boolean;
        suppliers: boolean;
    };
    sales: SalesIndicators | null;
    finance: FinanceIndicators | null;
    stock: StockIndicators | null;
    daily: {
        day: string;
        net: string | null;
        receipts: string | null;
        payments: string | null;
    }[];
    ranking: ReportRow[];
    alerts: {
        kind: string;
        title: string;
        count: number;
        href: string;
    }[];
};
export type ReportExport = {
    filename: string;
    csv: string;
    rows: number;
    generatedAt: string;
};

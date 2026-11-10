export const CRM_PERMISSIONS = [{ key: 'crm.read', label: 'Consultar clientes', description: 'Clientes e relacionamento somente nas unidades autorizadas.' }, { key: 'crm.manage', label: 'Cadastrar clientes', description: 'Criar e atualizar clientes; exige duas etapas.' }, { key: 'crm.credit', label: 'Aprovar crediário', description: 'Configurar limite e bloqueio de crédito por cliente e filial; exige duas etapas.' }, { key: 'crm.loyalty', label: 'Gerenciar fidelidade', description: 'Configurar pontos, ajustes e resgates auditados; exige duas etapas.' }, { key: 'orders.read', label: 'Consultar pedidos e entregas', description: 'Consultar pedidos e dados necessários à entrega na filial.' }, { key: 'orders.manage', label: 'Gerenciar pedidos', description: 'Criar e operar pedidos; reservas exigem estoque e conclusão exige financeiro.' }, { key: 'deliveries.manage', label: 'Operar entregas', description: 'Designar entregador e registrar saída, falha e conclusão; exige duas etapas.' }] as const;
export const ORDER_STATUSES = { draft: 'Rascunho', reserved: 'Reservado', ready: 'Separado', fulfilled: 'Concluído', cancelled: 'Cancelado', returned: 'Devolvido' } as const;
export const DELIVERY_STATUSES = { pending: 'Aguardando', assigned: 'Designada', out: 'Em rota', delivered: 'Entregue', failed: 'Não entregue', cancelled: 'Cancelada' } as const;
export type CustomerAddress = {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    postalCode: string;
};
export type Customer = {
    id: string;
    unitId: string;
    code: string;
    name: string;
    document: string;
    phone: string;
    email: string;
    address: CustomerAddress;
    notes: string;
    active: boolean;
    loyaltyOptIn: boolean;
    version: number;
    createdAt: string;
};
export type CustomerCredit = {
    id: string;
    limit: string;
    enabled: boolean;
    reason: string;
    version: number;
    approvedBy: string;
    exposure: string;
    overdue: string;
    held: string;
    available: string;
};
export type CustomerDetail = {
    customer: Customer;
    points: string;
    credit: CustomerCredit | null;
    canCredit: boolean;
};
export type LoyaltyEvent = {
    id: string;
    customerId: string;
    customerName: string;
    kind: string;
    points: string;
    reason: string;
    actorName: string;
    createdAt: string;
    orderId: string | null;
};
export type CustomerOrder = {
    id: string;
    unitId: string;
    number: string;
    customerId: string;
    customer: {
        name: string;
        phone: string;
        code: string;
    };
    address: CustomerAddress;
    channel: string;
    mode: 'pickup' | 'delivery';
    payment: 'paid' | 'credit';
    status: keyof typeof ORDER_STATUSES;
    items: {
        id: string;
        productId: string;
        name: string;
        code: string;
        baseUnit: string;
        quantity: string;
        unitPrice: string;
        total: string;
        cost?: string;
        lots?: {
            code: string;
            expiresOn: string;
            quantity: string;
        }[];
    }[];
    gross: string;
    deliveryFee: string;
    total: string;
    dueDate: string;
    installments: number;
    intervalDays: number;
    version: number;
    reason: string;
    notes: string;
    actorName: string;
    createdAt: string;
    fulfilledAt: string | null;
    returnedAt: string | null;
    capabilities: {
        manage: boolean;
        stock: boolean;
        finance: boolean;
        settle: boolean;
    };
};
export type CustomerDelivery = {
    id: string;
    orderId: string;
    number: string;
    unitId: string;
    customer: {
        name: string;
        phone: string;
        code: string;
    };
    address: CustomerAddress;
    status: keyof typeof DELIVERY_STATUSES;
    orderStatus: string;
    courier: string;
    recipient: string;
    scheduledOn: string | null;
    version: number;
    history: {
        status: string;
        actor: string;
        reason: string;
        at: string;
    }[];
    createdAt: string;
};
export type CrmOverview = {
    unitId: string | null;
    today: string;
    canManage: boolean;
    canCredit: boolean;
    canLoyalty: boolean;
    canOrders: boolean;
    canDeliver: boolean;
    program: {
        id: string;
        centsPerPoint: number;
        active: boolean;
        version: number;
    } | null;
    summary: {
        customers: number;
        orders: number;
        reserved: number;
        deliveries: number;
        credit: string | null;
    };
};
export type CrmPage<T> = {
    items: T[];
    page: number;
    total: number;
};

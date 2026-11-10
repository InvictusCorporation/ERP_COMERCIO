export const COMMERCIAL_MODULES = {
  inventory: 'Produtos e estoque', pos: 'Vendas e PDV', purchasing: 'Fornecedores e compras',
  finance: 'Financeiro', fiscal: 'Fiscal', lots: 'Lotes e validade', supermarket: 'Setores, pesagem e produção',
  network: 'Rede e distribuição', crm: 'Clientes, pedidos e entregas', reports: 'Relatórios e indicadores',
} as const;
export type CommercialModule = keyof typeof COMMERCIAL_MODULES;
export const MODULE_DEPENDENCIES: Partial<Record<CommercialModule, CommercialModule[]>> = {
  pos: ['inventory'], purchasing: ['inventory'], fiscal: ['inventory', 'pos'], lots: ['inventory'],
  supermarket: ['inventory', 'lots'], network: ['inventory', 'purchasing'], crm: ['inventory', 'finance'],
};
export const SUBSCRIPTION_STATES = { trial: 'Em avaliação', active: 'Ativa', pending: 'Pendente', suspended: 'Suspensa', cancelled: 'Cancelada' } as const;
export type SubscriptionState = keyof typeof SUBSCRIPTION_STATES;
export type CommercialLimits = { users: number | null; units: number | null; products: number | null };
export type CommercialPlan = { id: string; name: string; description: string; modules: CommercialModule[]; limits: CommercialLimits; monthlyPrice: string | null; active: boolean; version: number };
export type TenantBrand = { displayName: string; tagline: string; accent: string; logoPng: string; slug: string; version: number };
export type CommercialLicense = { managed: boolean; effective: boolean; state: SubscriptionState | 'legacy'; planName: string; modules: CommercialModule[]; branding: TenantBrand | null };
export type CommercialSubscription = { tenantId: string; plan: CommercialPlan; enabledModules: CommercialModule[]; state: SubscriptionState; startsOn: string; endsOn: string; reason: string; version: number };
export type CommercialEvent = { id: string; tenantId: string | null; actorName: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown>; createdAt: string };
export type CommercialOverview = { license: CommercialLicense; subscription: CommercialSubscription | null; usage: CommercialLimits | null; canCustomize: boolean; isOwner: boolean; isOperator: boolean; today: string };
export function permissionModule(permission: string): CommercialModule | null {
  const prefix = permission.split('.')[0];
  return ({ products: 'inventory', stock: 'inventory', pos: 'pos', suppliers: 'purchasing', purchases: 'purchasing', finance: 'finance', fiscal: 'fiscal', crm: 'crm', orders: 'crm', deliveries: 'crm', reports: 'reports' } as Record<string, CommercialModule>)[prefix!] || null;
}

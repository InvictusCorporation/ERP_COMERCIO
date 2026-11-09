export const AUDIT_CATEGORIES = {
  products: "Produtos",
  inventory: "Estoque",
  organizations: "Empresas e unidades",
  users: "Usuários",
  permissions: "Perfis e permissões",
  invitations: "Convites",
  security: "Segurança da conta",
  context: "Contexto de acesso",
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;
export const AUDIT_ACTIONS: Record<string, string> = {
  "product.created": "Produto cadastrado",
  "product.changed": "Produto alterado",
  "stock.created": "Estoque movimentado",
  "stock_settings.created": "Limites de estoque definidos",
  "stock_settings.changed": "Limites de estoque alterados",
  "company.created": "Empresa cadastrada",
  "company.changed": "Empresa alterada",
  "company.deleted": "Empresa removida",
  "unit.created": "Unidade cadastrada",
  "unit.changed": "Unidade alterada",
  "unit.deleted": "Unidade removida",
  "member.created": "Vínculo criado",
  "member.changed": "Acesso do usuário alterado",
  "member.deleted": "Vínculo removido",
  "role.created": "Perfil criado",
  "role.changed": "Perfil alterado",
  "role.deleted": "Perfil removido",
  "invitation.created": "Convite criado",
  "invitation.changed": "Convite atualizado",
  "invitation.deleted": "Convite removido",
  "invite.created": "Convite criado",
  "invite.revoked": "Convite revogado",
  "invite.accepted": "Convite aceito",
  "scope.granted": "Unidade autorizada",
  "scope.revoked": "Autorização de unidade removida",
  login_failed: "Tentativa de acesso recusada",
  login_succeeded: "Senha de acesso validada",
  logout: "Saída da conta",
  sessions_revoked: "Sessões encerradas",
  password_reset_requested: "Recuperação de senha solicitada",
  password_reset_completed: "Senha redefinida",
  mfa_enabled: "Duas etapas ativadas",
  mfa_verified: "Duas etapas verificadas",
  "context.changed": "Contexto de acesso atualizado",
};
export const AUDIT_FIELDS: Record<string, string> = {
  description: "Descrição",
  category: "Categoria",
  brand: "Marca",
  base_unit: "Unidade-base",
  package_name: "Embalagem",
  package_factor: "Fator da embalagem",
  barcodes: "Códigos de barras",
  sale_price: "Preço de venda",
  desired_margin: "Margem desejada",
  minimum_margin: "Margem mínima",
  minimum_stock: "Estoque mínimo",
  ideal_stock: "Estoque ideal",
  quantity: "Quantidade",
  factor: "Fator utilizado",
  base_quantity: "Quantidade em unidade-base",
  cost: "Custo por unidade informada",
  physical_delta: "Variação física",
  reserved_delta: "Variação reservada",
  value_delta: "Variação do valor em custo",
  physical_after: "Físico após movimento",
  reserved_after: "Reservado após movimento",
  value_after: "Valor após movimento",
  reason: "Motivo",
  reversal_of: "Movimento estornado",
  legal_name: "Razão social",
  trade_name: "Nome fantasia",
  cnpj: "CNPJ",
  state_registration: "Inscrição estadual",
  email: "E-mail",
  phone: "Telefone",
  address: "Endereço",
  city: "Cidade",
  state: "UF",
  postal_code: "CEP",
  active: "Ativo",
  name: "Nome",
  kind: "Tipo",
  code: "Código",
  company_name: "Empresa",
  parent_name: "Unidade superior",
  is_owner: "Proprietário",
  all_units: "Acesso a toda a rede",
  role_name: "Perfil de acesso",
  permissions: "Permissões",
  system: "Perfil padrão",
  display_name: "Nome do convidado",
  expires_at: "Validade do convite",
  accepted_at: "Aceito em",
  revoked_at: "Revogado em",
  unit_name: "Unidade",
  unit_id: "Identificador da unidade",
  network_name: "Rede",
};
export type AuditEntry = {
  id: string;
  tenantId: string | null;
  unitId: string | null;
  actorId: string | null;
  actorName: string;
  targetLabel: string;
  category: AuditCategory;
  entityType: string;
  entityId: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string | null;
  legacy: boolean;
  createdAt: string;
};
export type AuditFilters = {
  scope: "network" | "personal";
  category?: AuditCategory;
  action?: string;
  actor?: string;
  unitId?: string;
  entityId?: string;
  requestId?: string;
  from?: string;
  to?: string;
  query?: string;
  page: number;
  pageSize: number;
};
export type AuditPage = {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actors: { id: string; name: string }[];
  units: { id: string; name: string }[];
  summary: { changes: number; legacy: number; operations: number };
};

export const PERMISSIONS = [
{key:'pos.read',label:'Consultar PDV, vendas e caixas',description:'Consultar vendas, custos e caixas nas unidades autorizadas.'},
{key:'pos.sell',label:'Operar vendas no PDV',description:'Criar e finalizar vendas no próprio caixa; exige consulta, caixa e duas etapas.'},
{key:'pos.cash',label:'Abrir e fechar o próprio caixa',description:'Abrir e conferir o próprio caixa na unidade; exige duas etapas.'},
{key:'pos.cash.manage',label:'Gerenciar movimentos de caixa',description:'Sangria, suprimento e fechamento supervisionado; exige caixa e duas etapas.'},
{key:'pos.discount',label:'Autorizar descontos no PDV',description:'Conceder desconto sobre os preços cadastrados; exige operação de vendas e duas etapas.'},
{key:'pos.refund',label:'Devolver vendas confirmadas',description:'Devolução integral e reembolso simulado em caixa aberto da unidade; exige caixa e duas etapas.'},
  {
    key: "suppliers.read",
    label: "Consultar fornecedores",
    description: "Consultar o cadastro central de fornecedores.",
  },
  {
    key: "suppliers.manage",
    label: "Gerenciar fornecedores",
    description:
      "Cadastrar e inativar fornecedores; exige escopo global e duas etapas.",
  },
  {
    key: "purchases.read",
    label: "Consultar compras",
    description:
      "Ver pedidos e recebimentos nas unidades autorizadas; requer consulta de produtos e fornecedores.",
  },
  {
    key: "purchases.manage",
    label: "Gerenciar pedidos de compra",
    description:
      "Criar, editar rascunhos e cancelar pedidos sem recebimento; exige duas etapas.",
  },
  {
    key: "purchases.approve",
    label: "Aprovar compras",
    description: "Aprovar pedidos nas unidades autorizadas; exige duas etapas.",
  },
  {
    key: "purchases.receive",
    label: "Conferir e receber compras",
    description:
      "Receber e estornar recebimentos; exige movimentação de estoque e duas etapas.",
  },
  {
    key: "products.read",
    label: "Consultar produtos",
    description: "Consultar o catálogo central da rede.",
  },
  {
    key: "products.manage",
    label: "Gerenciar produtos e preços",
    description:
      "Cadastrar e alterar produtos e preços; exige escopo de toda a rede e duas etapas.",
  },
  {
    key: "stock.read",
    label: "Consultar estoque",
    description:
      "Consultar saldos e movimentos somente nas unidades autorizadas.",
  },
  {
    key: "stock.manage",
    label: "Movimentar estoque",
    description:
      "Entradas, saídas, perdas, reservas, limites e estorno nas unidades autorizadas; exige duas etapas.",
  },
  {
    key: "audit.read",
    label: "Consultar auditoria e histórico",
    description:
      "Ver alterações autorizadas na rede ou nas unidades atribuídas; exige autenticação em duas etapas.",
  },
  {
    key: "organizations.read",
    label: "Consultar empresas e unidades",
    description: "Ver empresas e unidades autorizadas na rede.",
  },
  {
    key: "organizations.manage",
    label: "Gerenciar empresas e unidades",
    description:
      "Cadastrar e inativar empresas, matriz, filiais e depósitos; exige acesso a toda a rede.",
  },
  {
    key: "users.read",
    label: "Consultar usuários e perfis",
    description: "Ver a equipe e seus acessos nesta empresa.",
  },
  {
    key: "users.manage",
    label: "Gerenciar usuários e convites",
    description: "Convidar pessoas, alterar perfis e suspender vínculos.",
  },
  {
    key: "roles.manage",
    label: "Configurar perfis de acesso",
    description: "Criar e editar perfis com permissões autorizadas.",
  },
  {
    key: "ownership.manage",
    label: "Gerenciar proprietários",
    description:
      "Exclusiva do proprietário; indisponível em perfis personalizados.",
  },
] as const;
export type Permission = (typeof PERMISSIONS)[number]["key"];
export const OWNER_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);
export type AccessRole = {
  id: string;
  name: string;
  system: boolean;
  permissions: Permission[];
  sensitive: boolean;
};
export type AccessMember = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  isOwner: boolean;
  roleId: string;
  roleName: string;
  mfaEnabled: boolean;
  allUnits: boolean;
  unitIds: string[];
};
export type AccessInvite = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  expiresAt: string;
  allUnits: boolean;
  unitIds: string[];
  status: "pending" | "accepted" | "revoked" | "expired";
};
export type AccessOverview = {
  tenant: {
    id: string;
    name: string;
  };
  actorId: string;
  permissions: Permission[];
  roles: AccessRole[];
  members: AccessMember[];
  invitations: AccessInvite[];
  units: import("./organizations").UnitOption[];
};
export type InvitePreview = {
  email: string;
  name: string;
  company: string;
  role: string;
  existingAccount: boolean;
};

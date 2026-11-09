export const PERMISSIONS = [
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

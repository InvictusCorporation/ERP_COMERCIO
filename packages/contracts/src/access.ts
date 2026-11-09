export const PERMISSIONS = [
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
};
export type AccessInvite = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  expiresAt: string;
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
};
export type InvitePreview = {
  email: string;
  name: string;
  company: string;
  role: string;
  existingAccount: boolean;
};

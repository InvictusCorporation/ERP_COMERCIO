export const UNIT_KINDS = {
  matriz: "Matriz",
  filial: "Filial / Loja",
  cd: "Centro de distribuição",
  deposito: "Depósito",
} as const;
export type UnitKind = keyof typeof UNIT_KINDS;
export type UnitOption = {
  id: string;
  name: string;
  code: string;
  kind: UnitKind;
  companyId: string;
  companyName: string;
};
export type UnitScope = { allUnits: boolean; unitIds: string[] };
export type LegalCompany = {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  active: boolean;
};
export type OrganizationUnit = {
  id: string;
  companyId: string;
  parentId: string | null;
  name: string;
  code: string;
  kind: UnitKind;
  cnpj: string | null;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  active: boolean;
  available: boolean;
};
export type OrganizationOverview = {
  companies: LegalCompany[];
  units: OrganizationUnit[];
  canManage: boolean;
  allUnits: boolean;
  network: string;
};

export type SessionStage = "authenticated" | "mfa_setup" | "mfa_challenge";
export type AuthSession = {
  id: string;
  stage: SessionStage;
  csrf: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    mfaEnabled: boolean;
    mfaRequired: boolean;
  };
  tenants: { id: string; name: string; isOwner: boolean }[];
  activeTenantId: string | null;
  units: import("./organizations").UnitOption[];
  allUnits: boolean;
  activeUnitId: string | null;
  permissions: import("./access").Permission[];
};
export type SessionEntry = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
  current: boolean;
};

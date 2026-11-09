CREATE SCHEMA organizations;
REVOKE ALL ON SCHEMA organizations FROM PUBLIC;
CREATE TABLE organizations.companies (
 tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 legal_name text NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 1 AND 160),
 trade_name text NOT NULL CHECK(length(btrim(trade_name)) BETWEEN 1 AND 120),
 cnpj text NOT NULL CHECK(cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
 cnpj_root text GENERATED ALWAYS AS (left(cnpj,8)) STORED,
 state_registration text NOT NULL DEFAULT '' CHECK(length(state_registration)<=30),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=254), phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=240), city text NOT NULL DEFAULT '' CHECK(length(city)<=100),
 state text NOT NULL DEFAULT '' CHECK(state='' OR state ~ '^[A-Z]{2}$'), postal_code text NOT NULL DEFAULT '' CHECK(postal_code='' OR postal_code ~ '^[0-9]{8}$'),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,cnpj), UNIQUE(tenant_id,cnpj_root)
);
CREATE TABLE organizations.units (
 tenant_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
 parent_id uuid, kind text NOT NULL CHECK(kind IN ('matriz','filial','cd','deposito')),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 cnpj text CHECK(cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=240), city text NOT NULL DEFAULT '' CHECK(length(city)<=100),
 state text NOT NULL DEFAULT '' CHECK(state='' OR state ~ '^[A-Z]{2}$'), postal_code text NOT NULL DEFAULT '' CHECK(postal_code='' OR postal_code ~ '^[0-9]{8}$'),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,code), UNIQUE(tenant_id,cnpj),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organizations.companies(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,parent_id) REFERENCES organizations.units(tenant_id,company_id,id),
 CHECK((kind='matriz' AND parent_id IS NULL AND cnpj IS NOT NULL) OR (kind<>'matriz' AND parent_id IS NOT NULL)), CHECK(parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX one_headquarters_per_company ON organizations.units(tenant_id,company_id) WHERE kind='matriz';
ALTER TABLE identity.memberships ADD COLUMN all_units boolean NOT NULL DEFAULT true;
ALTER TABLE identity.memberships ADD CONSTRAINT owner_all_units CHECK(NOT is_owner OR all_units);
ALTER TABLE access.invitations ADD COLUMN all_units boolean NOT NULL DEFAULT true;
ALTER TABLE access.invitations ADD CONSTRAINT invitation_owner_all_units CHECK(NOT is_owner OR all_units);
ALTER TABLE identity.sessions ADD COLUMN active_unit_id uuid;
CREATE TABLE organizations.membership_units (
 tenant_id uuid NOT NULL, membership_id uuid NOT NULL, unit_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,membership_id,unit_id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES identity.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE TABLE organizations.invitation_units (
 tenant_id uuid NOT NULL, invitation_id uuid NOT NULL, unit_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,invitation_id,unit_id),
 FOREIGN KEY(tenant_id,invitation_id) REFERENCES access.invitations(tenant_id,id),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
ALTER TABLE access.roles DROP CONSTRAINT roles_permissions_check;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT organization_manage_requires_read CHECK(NOT 'organizations.manage'=ANY(permissions) OR 'organizations.read'=ANY(permissions));
-- Migração de perfis padrão existentes sem conceder administração a perfis personalizados.
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=array_append(permissions,'organizations.read') WHERE system;
UPDATE access.roles SET permissions=array_append(permissions,'organizations.manage') WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE access.events DROP CONSTRAINT events_action_check;
ALTER TABLE access.events ADD CONSTRAINT access_action_catalog CHECK(action IN ('invite.created','invite.revoked','invite.accepted','member.changed','role.created','role.changed','company.created','company.changed','unit.created','unit.changed'));

GRANT USAGE ON SCHEMA organizations TO invictus_auth,invictus_app;
GRANT SELECT,INSERT,UPDATE ON organizations.companies,organizations.units TO invictus_auth;
GRANT SELECT,INSERT,DELETE ON organizations.membership_units,organizations.invitation_units TO invictus_auth;
GRANT SELECT ON organizations.companies,organizations.units,organizations.membership_units TO invictus_app;
ALTER TABLE organizations.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.units FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations.membership_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.membership_units FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations.invitation_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.invitation_units FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_auth ON organizations.companies TO invictus_auth USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
CREATE POLICY units_auth ON organizations.units TO invictus_auth USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
CREATE POLICY membership_units_auth ON organizations.membership_units TO invictus_auth USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
CREATE POLICY invitation_units_auth ON organizations.invitation_units TO invictus_auth USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
-- O definer abaixo só retorna disponibilidade booleana, sempre limitada ao tenant do contexto.
CREATE POLICY companies_migration_read ON organizations.companies FOR SELECT TO invictus_migrator USING(true);
CREATE POLICY units_migration_read ON organizations.units FOR SELECT TO invictus_migrator USING(true);
CREATE FUNCTION organizations.unit_available(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE ancestors AS (
  SELECT u.id,u.parent_id,u.kind,u.active,u.company_id,u.tenant_id,1 AS depth FROM organizations.units u
  JOIN organizations.companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
  WHERE u.id=target AND u.tenant_id=coalesce(nullif(current_setting('app.auth_tenant_id',true),''),nullif(current_setting('app.tenant_id',true),''))::uuid AND c.active
  UNION ALL
  SELECT p.id,p.parent_id,p.kind,p.active,p.company_id,p.tenant_id,a.depth+1 FROM organizations.units p JOIN ancestors a ON p.tenant_id=a.tenant_id AND p.company_id=a.company_id AND p.id=a.parent_id WHERE a.depth<5
 ) SELECT coalesce(bool_and(active) AND bool_or(kind='matriz' AND parent_id IS NULL),false) FROM ancestors
$$;
REVOKE ALL ON FUNCTION organizations.unit_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.unit_available(uuid) TO invictus_auth,invictus_app;
CREATE POLICY member_units_self ON organizations.membership_units FOR SELECT TO invictus_app
USING(tenant_id=identity.current_tenant_id() AND EXISTS(SELECT 1 FROM identity.memberships m WHERE m.tenant_id=membership_units.tenant_id AND m.id=membership_units.membership_id AND m.user_id=identity.current_actor_id() AND m.active));
CREATE POLICY unit_runtime ON organizations.units FOR SELECT TO invictus_app
USING(tenant_id=identity.current_tenant_id() AND id=nullif(current_setting('app.unit_id',true),'')::uuid AND organizations.unit_available(id) AND EXISTS(
 SELECT 1 FROM identity.memberships m WHERE m.tenant_id=units.tenant_id AND m.user_id=identity.current_actor_id() AND m.active AND (m.is_owner OR m.all_units OR EXISTS(SELECT 1 FROM organizations.membership_units a WHERE a.tenant_id=m.tenant_id AND a.membership_id=m.id AND a.unit_id=units.id))
));
CREATE POLICY company_runtime ON organizations.companies FOR SELECT TO invictus_app
USING(tenant_id=identity.current_tenant_id() AND EXISTS(SELECT 1 FROM organizations.units u WHERE u.tenant_id=companies.tenant_id AND u.company_id=companies.id));

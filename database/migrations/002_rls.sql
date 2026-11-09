CREATE FUNCTION identity.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE FUNCTION identity.current_actor_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

ALTER TABLE identity.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.memberships FORCE ROW LEVEL SECURITY;
-- Esta política não chama has_active_membership, evitando recursão de RLS.
CREATE POLICY membership_self ON identity.memberships FOR SELECT
USING (tenant_id = identity.current_tenant_id() AND user_id = identity.current_actor_id());

-- A função só devolve um booleano. Não aceita IDs arbitrários, não modifica
-- dados e tem search_path fixo. A identidade global não é legível pela API.
CREATE FUNCTION identity.has_active_membership() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.memberships m
    JOIN identity.users u ON u.id = m.user_id
    WHERE m.tenant_id = identity.current_tenant_id()
      AND m.user_id = identity.current_actor_id() AND m.active AND u.active
  )
$$;

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_member ON tenancy.tenants FOR SELECT
USING (id = identity.current_tenant_id() AND active AND identity.has_active_membership());

CREATE FUNCTION identity.has_active_tenant() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT EXISTS (SELECT 1 FROM tenancy.tenants WHERE id = identity.current_tenant_id() AND active) $$;

ALTER TABLE tenancy.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.settings FORCE ROW LEVEL SECURITY;
CREATE POLICY settings_tenant ON tenancy.settings FOR ALL
USING (tenant_id = identity.current_tenant_id() AND identity.has_active_tenant())
WITH CHECK (tenant_id = identity.current_tenant_id() AND identity.has_active_tenant());

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_tenant_id(), identity.current_actor_id(),
  identity.has_active_membership(), identity.has_active_tenant() TO invictus_app;

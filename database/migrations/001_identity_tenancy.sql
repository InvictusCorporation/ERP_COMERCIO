CREATE SCHEMA identity;
CREATE SCHEMA tenancy;
REVOKE ALL ON SCHEMA identity, tenancy FROM PUBLIC;

CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);

CREATE TABLE tenancy.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.memberships (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON identity.memberships(user_id, tenant_id);

-- Configuração escopada é o primeiro recurso persistente da fundação.
-- Não contém produtos, saldos, pagamentos ou dados simulados de operação.
CREATE TABLE tenancy.settings (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  value jsonb NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, key),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES identity.memberships(tenant_id, id)
);

REVOKE ALL ON ALL TABLES IN SCHEMA identity, tenancy FROM PUBLIC;
GRANT USAGE ON SCHEMA identity, tenancy TO invictus_app;
GRANT SELECT ON tenancy.tenants, identity.memberships TO invictus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.settings TO invictus_app;
-- Sem GRANT de users, DDL, TRUNCATE, REFERENCES, criação ou alteração de vínculos.

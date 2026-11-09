ALTER TABLE identity.memberships ADD COLUMN is_owner boolean NOT NULL DEFAULT false;

CREATE TABLE identity.credentials (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  mfa_required boolean NOT NULL DEFAULT true,
  mfa_secret_enc text,
  mfa_enabled_at timestamptz,
  mfa_pending_enc text,
  mfa_pending_until timestamptz,
  mfa_last_step bigint NOT NULL DEFAULT -1
);
CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  stage text NOT NULL CHECK (stage IN ('authenticated','mfa_setup','mfa_challenge')),
  mfa_verified_at timestamptz,
  active_tenant_id uuid REFERENCES tenancy.tenants(id),
  user_agent text NOT NULL CHECK (length(user_agent)<=220),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON identity.sessions(user_id,expires_at);
CREATE TABLE identity.recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX recovery_user_idx ON identity.recovery_tokens(user_id);
CREATE TABLE identity.auth_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL CHECK (attempts>0),
  expires_at timestamptz NOT NULL
);
CREATE TABLE identity.mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  payload_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE identity.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES identity.users(id),
  event_type text NOT NULL CHECK (event_type IN ('login_failed','login_succeeded','logout','sessions_revoked','password_reset_requested','password_reset_completed','mfa_enabled','mfa_verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Papel de identidade é separado do papel comercial, sem acesso global
-- da conta invictus_app às credenciais ou à tabela de usuários.
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM PUBLIC;
GRANT USAGE ON SCHEMA identity,tenancy TO invictus_auth;
GRANT SELECT ON identity.users,identity.memberships,tenancy.tenants TO invictus_auth;
GRANT SELECT,INSERT,UPDATE ON identity.credentials,identity.sessions,
  identity.recovery_tokens,identity.auth_rate_limits,identity.mail_outbox TO invictus_auth;
GRANT INSERT ON identity.auth_events TO invictus_auth;

CREATE FUNCTION identity.current_auth_actor_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT nullif(current_setting('app.auth_user_id',true),'')::uuid $$;
REVOKE ALL ON FUNCTION identity.current_auth_actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_auth_actor_id(),identity.current_tenant_id(),
  identity.current_actor_id(),identity.has_active_membership() TO invictus_auth;

CREATE POLICY membership_auth_context ON identity.memberships FOR SELECT TO invictus_auth
USING (user_id=identity.current_auth_actor_id() AND active);
CREATE POLICY tenant_auth_context ON tenancy.tenants FOR SELECT TO invictus_auth
USING (active AND EXISTS (SELECT 1 FROM identity.memberships m WHERE m.tenant_id=tenants.id
  AND m.user_id=identity.current_auth_actor_id() AND m.active));

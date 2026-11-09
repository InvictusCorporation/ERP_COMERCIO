CREATE SCHEMA access;
REVOKE ALL ON SCHEMA access FROM PUBLIC;
CREATE TABLE access.roles (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
  system boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,name),
  CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage']::text[]),
  CHECK(NOT ('users.manage'=ANY(permissions) OR 'roles.manage'=ANY(permissions)) OR 'users.read'=ANY(permissions))
);
ALTER TABLE identity.memberships ADD COLUMN role_id uuid;
ALTER TABLE identity.memberships ADD CONSTRAINT memberships_role_fk FOREIGN KEY(tenant_id,role_id) REFERENCES access.roles(tenant_id,id);
CREATE TABLE access.invitations (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 120),
  role_id uuid NOT NULL, is_owner boolean NOT NULL DEFAULT false,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  accepted_at timestamptz, revoked_at timestamptz,
  PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,role_id) REFERENCES access.roles(tenant_id,id)
);
CREATE UNIQUE INDEX invitations_pending_email ON access.invitations(tenant_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE access.events (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES identity.users(id),
  action text NOT NULL CHECK(action IN ('invite.created','invite.revoked','invite.accepted','member.changed','role.created','role.changed')),
  target_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id)
);
ALTER TABLE identity.mail_outbox ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE identity.mail_outbox ADD COLUMN recipient text;
UPDATE identity.mail_outbox o SET recipient=u.email FROM identity.users u WHERE u.id=o.user_id;
ALTER TABLE identity.mail_outbox ALTER COLUMN recipient SET NOT NULL;
CREATE FUNCTION identity.outbox_recipient() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.recipient IS NULL THEN SELECT email INTO NEW.recipient FROM identity.users WHERE id=NEW.user_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbox_recipient BEFORE INSERT ON identity.mail_outbox FOR EACH ROW EXECUTE FUNCTION identity.outbox_recipient();
GRANT USAGE ON SCHEMA access TO invictus_auth;
GRANT SELECT,INSERT,UPDATE ON access.roles,access.invitations TO invictus_auth;
GRANT INSERT ON access.events TO invictus_auth;
GRANT INSERT ON identity.users TO invictus_auth;
GRANT INSERT,UPDATE ON identity.memberships TO invictus_auth;
CREATE FUNCTION identity.current_auth_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT nullif(current_setting('app.auth_tenant_id',true),'')::uuid $$;
REVOKE ALL ON FUNCTION identity.current_auth_tenant_id(),identity.outbox_recipient() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_auth_tenant_id() TO invictus_auth;
-- O serviço estabelece o contexto apenas após validar a sessão e o vínculo.
CREATE POLICY membership_access_context ON identity.memberships TO invictus_auth
USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
ALTER TABLE access.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_auth_context ON access.roles TO invictus_auth
USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
ALTER TABLE access.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE access.invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_auth_context ON access.invitations TO invictus_auth
USING(tenant_id=identity.current_auth_tenant_id()) WITH CHECK(tenant_id=identity.current_auth_tenant_id());
CREATE POLICY invitation_token_context ON access.invitations FOR SELECT TO invictus_auth
USING(token_hash=nullif(current_setting('app.invitation_hash',true),''));
CREATE POLICY tenant_invitation_context ON tenancy.tenants FOR SELECT TO invictus_auth
USING(EXISTS(SELECT 1 FROM access.invitations i WHERE i.tenant_id=tenants.id AND i.token_hash=nullif(current_setting('app.invitation_hash',true),'')));
ALTER TABLE access.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE access.events FORCE ROW LEVEL SECURITY;
CREATE POLICY events_insert ON access.events FOR INSERT TO invictus_auth
WITH CHECK(tenant_id=identity.current_auth_tenant_id() AND actor_id=identity.current_auth_actor_id());

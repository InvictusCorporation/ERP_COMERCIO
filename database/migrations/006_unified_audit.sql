CREATE SCHEMA audit;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read']::text[]);
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=array_append(permissions,'audit.read') WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE audit.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES tenancy.tenants(id), unit_id uuid,
 subject_user_id uuid REFERENCES identity.users(id), actor_id uuid REFERENCES identity.users(id),
 actor_name text NOT NULL, target_label text NOT NULL,
 category text NOT NULL CHECK(category IN ('organizations','users','permissions','invitations','security','context')),
 entity_type text NOT NULL, entity_id uuid, action text NOT NULL,
 before_data jsonb, after_data jsonb,
 request_id uuid, transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
 legacy boolean NOT NULL DEFAULT false, legacy_origin text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((tenant_id IS NOT NULL AND subject_user_id IS NULL) OR (tenant_id IS NULL AND subject_user_id IS NOT NULL) OR (tenant_id IS NULL AND subject_user_id IS NULL AND category='security'))
);
CREATE INDEX audit_tenant_time ON audit.events(tenant_id,created_at DESC,id DESC);
CREATE INDEX audit_unit_time ON audit.events(tenant_id,unit_id,created_at DESC,id DESC);
CREATE INDEX audit_personal_time ON audit.events(subject_user_id,created_at DESC,id DESC) WHERE tenant_id IS NULL;
CREATE INDEX audit_request ON audit.events(request_id) WHERE request_id IS NOT NULL;
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA audit TO invictus_auth;
GRANT SELECT ON audit.events TO invictus_auth;
CREATE POLICY audit_read ON audit.events FOR SELECT TO invictus_auth USING (
 (tenant_id IS NULL AND subject_user_id=identity.current_auth_actor_id()) OR
 (tenant_id=identity.current_auth_tenant_id() AND EXISTS(
   SELECT 1 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id
   LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
   WHERE m.tenant_id=events.tenant_id AND m.user_id=identity.current_auth_actor_id() AND m.active AND u.active
    AND (m.is_owner OR 'audit.read'=ANY(r.permissions))
    AND (m.is_owner OR m.all_units OR (events.unit_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM organizations.membership_units a WHERE a.tenant_id=m.tenant_id AND a.membership_id=m.id AND a.unit_id=events.unit_id
    )))
 ))
);
-- A escrita é exclusiva dos triggers definer; a conta HTTP não recebe INSERT/UPDATE/DELETE/TRUNCATE.
CREATE POLICY audit_migration_write ON audit.events FOR INSERT TO invictus_migrator WITH CHECK(true);
CREATE POLICY audit_migration_read ON audit.events FOR SELECT TO invictus_migrator USING(true);
CREATE POLICY roles_audit_lookup ON access.roles FOR SELECT TO invictus_migrator USING(true);
CREATE POLICY members_audit_lookup ON identity.memberships FOR SELECT TO invictus_migrator USING(true);
CREATE POLICY invitations_audit_lookup ON access.invitations FOR SELECT TO invictus_migrator USING(true);
CREATE POLICY tenants_audit_lookup ON tenancy.tenants FOR SELECT TO invictus_migrator USING(true);

-- Registros anteriores não permitem reconstruir antes/depois ou correlação.
INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,legacy,legacy_origin,created_at)
SELECT e.tenant_id,CASE WHEN e.action LIKE 'unit.%' THEN e.target_id END,e.actor_id,u.display_name,'Registro anterior',
 CASE WHEN e.action LIKE 'company.%' OR e.action LIKE 'unit.%' THEN 'organizations' WHEN e.action LIKE 'role.%' THEN 'permissions' WHEN e.action LIKE 'invite.%' THEN 'invitations' ELSE 'users' END,
 split_part(e.action,'.',1),e.target_id,e.action,true,'access/'||e.id,e.created_at FROM access.events e JOIN identity.users u ON u.id=e.actor_id;
INSERT INTO audit.events(subject_user_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,legacy,legacy_origin,created_at)
SELECT e.user_id,CASE WHEN e.event_type IN('login_failed','password_reset_requested') THEN NULL ELSE e.user_id END,
 CASE WHEN e.event_type IN('login_failed','password_reset_requested') OR e.user_id IS NULL THEN 'Não autenticado' ELSE u.display_name END,
 'Segurança da conta','security','account',e.user_id,e.event_type,true,'identity/'||e.id,e.created_at FROM identity.auth_events e LEFT JOIN identity.users u ON u.id=e.user_id;

CREATE FUNCTION audit.safe_snapshot(kind text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE keys text[]; result jsonb; label text;
BEGIN
 IF d IS NULL THEN RETURN NULL; END IF;
 CASE kind
  WHEN 'company' THEN keys:=ARRAY['legal_name','trade_name','cnpj','state_registration','email','phone','address','city','state','postal_code','active'];
  WHEN 'unit' THEN keys:=ARRAY['name','kind','code','cnpj','address','city','state','postal_code','active'];
  WHEN 'member' THEN keys:=ARRAY['active','is_owner','all_units'];
  WHEN 'role' THEN keys:=ARRAY['name','permissions','system'];
  WHEN 'invitation' THEN keys:=ARRAY['email','display_name','is_owner','all_units','expires_at','accepted_at','revoked_at'];
  ELSE RAISE EXCEPTION 'Unsupported audit source';
 END CASE;
 SELECT jsonb_object_agg(key,value) INTO result FROM jsonb_each(d) WHERE key=ANY(keys);
 IF kind IN('member','invitation') THEN
  IF coalesce((d->>'is_owner')::boolean,false) THEN label:='Proprietário';
  ELSE SELECT name INTO label FROM access.roles WHERE tenant_id=(d->>'tenant_id')::uuid AND id=(d->>'role_id')::uuid; END IF;
  result:=result||jsonb_build_object('role_name',coalesce(label,'Operador de caixa'));
 ELSIF kind='unit' THEN
  SELECT trade_name INTO label FROM organizations.companies WHERE tenant_id=(d->>'tenant_id')::uuid AND id=(d->>'company_id')::uuid;
  result:=result||jsonb_build_object('company_name',label);
  SELECT name INTO label FROM organizations.units WHERE tenant_id=(d->>'tenant_id')::uuid AND id=(d->>'parent_id')::uuid;
  result:=result||jsonb_build_object('parent_name',label);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION audit.capture_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb; a jsonb; row_data jsonb; old_safe jsonb; new_safe jsonb; kind text; cat text; label text; target uuid; network uuid; branch uuid; actor uuid; actor_label text; action_name text;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); END IF;
 row_data:=coalesce(a,b); network:=(row_data->>'tenant_id')::uuid;
 IF TG_TABLE_SCHEMA='organizations' AND TG_TABLE_NAME='companies' THEN kind:='company';cat:='organizations';label:=row_data->>'trade_name';
 ELSIF TG_TABLE_SCHEMA='organizations' AND TG_TABLE_NAME='units' THEN kind:='unit';cat:='organizations';label:=row_data->>'name';branch:=(row_data->>'id')::uuid;
 ELSIF TG_TABLE_SCHEMA='identity' AND TG_TABLE_NAME='memberships' THEN kind:='member';cat:='users';SELECT display_name INTO label FROM identity.users WHERE id=(row_data->>'user_id')::uuid;
 ELSIF TG_TABLE_SCHEMA='access' AND TG_TABLE_NAME='roles' THEN
  IF coalesce((row_data->>'system')::boolean,false) THEN RETURN NEW; END IF;
  kind:='role';cat:='permissions';label:=row_data->>'name';
 ELSIF TG_TABLE_SCHEMA='access' AND TG_TABLE_NAME='invitations' THEN kind:='invitation';cat:='invitations';label:=row_data->>'display_name';
 ELSE RAISE EXCEPTION 'Unsupported audit source'; END IF;
 target:=(row_data->>'id')::uuid;old_safe:=audit.safe_snapshot(kind,b);new_safe:=audit.safe_snapshot(kind,a);
 IF old_safe IS NOT DISTINCT FROM new_safe THEN RETURN NEW; END IF;
 actor:=nullif(current_setting('app.auth_user_id',true),'')::uuid;
 IF actor IS NOT NULL THEN SELECT display_name INTO actor_label FROM identity.users WHERE id=actor; END IF;
 action_name:=kind||CASE TG_OP WHEN 'INSERT' THEN '.created' WHEN 'DELETE' THEN '.deleted' ELSE '.changed' END;
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id)
 VALUES(network,branch,actor,coalesce(actor_label,'Processo interno'),coalesce(label,'Cadastro'),cat,kind,target,action_name,old_safe,new_safe,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE FUNCTION audit.capture_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d jsonb; kind text; target uuid; actor uuid; actor_label text; target_label text; unit_label text; data jsonb;
BEGIN
 IF TG_OP='DELETE' THEN d:=to_jsonb(OLD); ELSE d:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='membership_units' THEN
  kind:='member';target:=(d->>'membership_id')::uuid;
  SELECT u.display_name INTO target_label FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=(d->>'tenant_id')::uuid AND m.id=target;
 ELSE kind:='invitation';target:=(d->>'invitation_id')::uuid;
  SELECT display_name INTO target_label FROM access.invitations WHERE tenant_id=(d->>'tenant_id')::uuid AND id=target;
 END IF;
 SELECT name INTO unit_label FROM organizations.units WHERE tenant_id=(d->>'tenant_id')::uuid AND id=(d->>'unit_id')::uuid;
 data:=jsonb_build_object('unit_name',unit_label,'unit_id',d->>'unit_id');
 actor:=nullif(current_setting('app.auth_user_id',true),'')::uuid;SELECT display_name INTO actor_label FROM identity.users WHERE id=actor;
 INSERT INTO audit.events(tenant_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id)
 VALUES((d->>'tenant_id')::uuid,actor,coalesce(actor_label,'Processo interno'),coalesce(target_label,'Vínculo'),'permissions',kind,target,
  CASE TG_OP WHEN 'INSERT' THEN 'scope.granted' ELSE 'scope.revoked' END,
  CASE TG_OP WHEN 'DELETE' THEN data END,CASE TG_OP WHEN 'INSERT' THEN data END,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE FUNCTION audit.capture_security() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; actor_label text;
BEGIN
 IF NEW.event_type NOT IN('login_failed','password_reset_requested') THEN actor:=NEW.user_id; END IF;
 SELECT display_name INTO actor_label FROM identity.users WHERE id=actor;
 INSERT INTO audit.events(subject_user_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,request_id)
 VALUES(NEW.user_id,actor,coalesce(actor_label,'Não autenticado'),'Segurança da conta','security','account',NEW.user_id,NEW.event_type,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 RETURN NEW;
END $$;
CREATE FUNCTION audit.capture_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_label text; b jsonb; a jsonb;
BEGIN
 IF OLD.active_tenant_id IS NOT DISTINCT FROM NEW.active_tenant_id AND OLD.active_unit_id IS NOT DISTINCT FROM NEW.active_unit_id THEN RETURN NEW; END IF;
 SELECT display_name INTO actor_label FROM identity.users WHERE id=NEW.user_id;
 b:=jsonb_build_object('network_name',(SELECT name FROM tenancy.tenants WHERE id=OLD.active_tenant_id),'unit_name',(SELECT name FROM organizations.units WHERE tenant_id=OLD.active_tenant_id AND id=OLD.active_unit_id));
 a:=jsonb_build_object('network_name',(SELECT name FROM tenancy.tenants WHERE id=NEW.active_tenant_id),'unit_name',(SELECT name FROM organizations.units WHERE tenant_id=NEW.active_tenant_id AND id=NEW.active_unit_id));
 INSERT INTO audit.events(subject_user_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id)
 VALUES(NEW.user_id,NEW.user_id,coalesce(actor_label,'Conta'),'Contexto da conta','context','account',NEW.user_id,'context.changed',b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 RETURN NEW;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC;
CREATE TRIGGER audit_capture_companies AFTER INSERT OR UPDATE OR DELETE ON organizations.companies FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_capture_units AFTER INSERT OR UPDATE OR DELETE ON organizations.units FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_capture_members AFTER INSERT OR UPDATE OR DELETE ON identity.memberships FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_capture_roles AFTER INSERT OR UPDATE OR DELETE ON access.roles FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_capture_invitations AFTER INSERT OR UPDATE OR DELETE ON access.invitations FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_capture_member_units AFTER INSERT OR DELETE ON organizations.membership_units FOR EACH ROW EXECUTE FUNCTION audit.capture_assignment();
CREATE TRIGGER audit_capture_invite_units AFTER INSERT OR DELETE ON organizations.invitation_units FOR EACH ROW EXECUTE FUNCTION audit.capture_assignment();
CREATE TRIGGER audit_capture_security AFTER INSERT ON identity.auth_events FOR EACH ROW EXECUTE FUNCTION audit.capture_security();
CREATE TRIGGER audit_capture_context AFTER UPDATE ON identity.sessions FOR EACH ROW EXECUTE FUNCTION audit.capture_context();

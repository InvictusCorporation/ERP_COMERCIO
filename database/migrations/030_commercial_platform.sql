-- Etapa 13.1. Contratos administrativos manuais; sem cobrança externa.
CREATE SCHEMA commercial;
REVOKE ALL ON SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial TO invictus_auth;
CREATE TABLE commercial.operators(user_id uuid PRIMARY KEY REFERENCES identity.users(id),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE commercial.plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL UNIQUE CHECK(length(btrim(name)) BETWEEN 2 AND 60),description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 modules text[] NOT NULL,limits jsonb NOT NULL,monthly_price numeric(12,2) CHECK(monthly_price>=0),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE commercial.subscriptions(
 tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id),plan_id uuid NOT NULL REFERENCES commercial.plans(id),plan_snapshot jsonb NOT NULL,
 enabled_modules text[] NOT NULL,state text NOT NULL CHECK(state IN('trial','active','pending','suspended','cancelled')),
 starts_on date NOT NULL,ends_on date NOT NULL CHECK(ends_on>=starts_on),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300),version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commercial.brandings(
 tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id),display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 2 AND 64),tagline text NOT NULL DEFAULT '' CHECK(length(tagline)<=100),
 accent text NOT NULL DEFAULT '#ffcc00' CHECK(accent IN('#ffcc00','#7dd3fc','#6ee7b7','#fda4af','#c4b5fd')),
 logo_png text NOT NULL DEFAULT '' CHECK(length(logo_png)<=280000 AND (logo_png='' OR logo_png LIKE 'data:image/png;base64,%')),
 slug text UNIQUE CHECK(slug IS NULL OR (slug ~ '^[a-z][a-z0-9-]{2,39}$' AND slug NOT IN('www','api','admin','master','app','login','suporte','invictus'))),version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE commercial.events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES tenancy.tenants(id),actor_id uuid REFERENCES identity.users(id),actor_name text NOT NULL,
 action text NOT NULL,before_data jsonb,after_data jsonb NOT NULL,request_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX commercial_events_tenant_time ON commercial.events(tenant_id,created_at DESC,id DESC);
CREATE FUNCTION commercial.is_operator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM commercial.operators o JOIN identity.users u ON u.id=o.user_id JOIN identity.credentials c ON c.user_id=o.user_id WHERE o.user_id=identity.current_auth_actor_id() AND o.active AND u.active AND c.mfa_secret_enc IS NOT NULL)
$$;
CREATE FUNCTION commercial.is_owner(net uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT net=identity.current_auth_tenant_id() AND EXISTS(SELECT 1 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=net AND m.user_id=identity.current_auth_actor_id() AND m.is_owner AND m.active AND u.active)
$$;
DO $$DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['operators','plans','subscriptions','brandings','events'] LOOP
  EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY commercial_internal ON commercial.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
  EXECUTE format('GRANT SELECT ON commercial.%I TO invictus_auth',tab);
 END LOOP;
END $$;
CREATE POLICY operator_read ON commercial.operators FOR SELECT TO invictus_auth USING(user_id=identity.current_auth_actor_id());
CREATE POLICY plan_read ON commercial.plans FOR SELECT TO invictus_auth USING(commercial.is_operator());
CREATE POLICY subscription_read ON commercial.subscriptions FOR SELECT TO invictus_auth USING(commercial.is_operator() OR commercial.is_owner(tenant_id));
CREATE POLICY branding_read ON commercial.brandings FOR SELECT TO invictus_auth USING(commercial.is_operator() OR (tenant_id=identity.current_auth_tenant_id() AND EXISTS(SELECT 1 FROM identity.memberships m WHERE m.tenant_id=brandings.tenant_id AND m.user_id=identity.current_auth_actor_id() AND m.active)));
CREATE POLICY commercial_events_read ON commercial.events FOR SELECT TO invictus_auth USING(commercial.is_operator() OR commercial.is_owner(tenant_id));
CREATE FUNCTION commercial.valid_modules(items text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT items IS NOT NULL AND cardinality(items) BETWEEN 1 AND 10 AND items <@ ARRAY['inventory','pos','purchasing','finance','fiscal','lots','supermarket','network','crm','reports']::text[]
 AND cardinality(items)=(SELECT count(DISTINCT x) FROM unnest(items) x) AND array_position(items,NULL) IS NULL
 AND (NOT items && ARRAY['pos','purchasing','fiscal','lots','supermarket','network','crm']::text[] OR 'inventory'=ANY(items))
 AND (NOT 'fiscal'=ANY(items) OR 'pos'=ANY(items)) AND (NOT 'supermarket'=ANY(items) OR 'lots'=ANY(items))
 AND (NOT 'network'=ANY(items) OR 'purchasing'=ANY(items)) AND (NOT 'crm'=ANY(items) OR 'finance'=ANY(items))
$$;
CREATE FUNCTION commercial.valid_limits(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$DECLARE k text;BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>3 OR NOT v ?& ARRAY['users','units','products'] THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['users','units','products'] LOOP IF v->k<>'null'::jsonb AND (jsonb_typeof(v->k)<>'number' OR (v->>k)!~'^[0-9]+$' OR (v->>k)::numeric NOT BETWEEN 1 AND 1000000) THEN RETURN false;END IF;END LOOP;RETURN true;
END $$;
ALTER TABLE commercial.plans ADD CHECK(commercial.valid_modules(modules)),ADD CHECK(commercial.valid_limits(limits));
ALTER TABLE commercial.subscriptions ADD CHECK(commercial.valid_modules(enabled_modules));
CREATE FUNCTION commercial.permission_module(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE split_part(p,'.',1) WHEN 'products' THEN 'inventory' WHEN 'stock' THEN 'inventory' WHEN 'pos' THEN 'pos' WHEN 'suppliers' THEN 'purchasing' WHEN 'purchases' THEN 'purchasing' WHEN 'finance' THEN 'finance' WHEN 'fiscal' THEN 'fiscal' WHEN 'crm' THEN 'crm' WHEN 'orders' THEN 'crm' WHEN 'deliveries' THEN 'crm' WHEN 'reports' THEN 'reports' END
$$;
CREATE FUNCTION commercial.module_allowed(net uuid,feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT feature IS NULL OR NOT EXISTS(SELECT 1 FROM commercial.subscriptions WHERE tenant_id=net) OR EXISTS(SELECT 1 FROM commercial.subscriptions s WHERE s.tenant_id=net AND s.state IN('active','trial') AND finance.today() BETWEEN s.starts_on AND s.ends_on AND feature=ANY(s.enabled_modules))
$$;
-- Sem contrato: compatibilidade da implantação anterior, explicitamente identificada na interface.
CREATE FUNCTION commercial.license(net uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE s commercial.subscriptions;b commercial.brandings;brand jsonb;BEGIN
 IF net IS NULL THEN RETURN NULL;END IF;
 IF net IS DISTINCT FROM identity.current_auth_tenant_id() OR NOT EXISTS(SELECT 1 FROM identity.memberships WHERE tenant_id=net AND user_id=identity.current_auth_actor_id() AND active) THEN RAISE EXCEPTION 'Rede não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM commercial.subscriptions WHERE tenant_id=net;SELECT * INTO b FROM commercial.brandings WHERE tenant_id=net;
 IF b.tenant_id IS NOT NULL THEN brand:=jsonb_build_object('displayName',b.display_name,'tagline',b.tagline,'accent',b.accent,'logoPng',b.logo_png,'slug',coalesce(b.slug,''),'version',b.version);END IF;
 RETURN jsonb_build_object('managed',s.tenant_id IS NOT NULL,'effective',s.tenant_id IS NULL OR (s.state IN('active','trial') AND finance.today() BETWEEN s.starts_on AND s.ends_on),'state',coalesce(s.state,'legacy'),'planName',coalesce(s.plan_snapshot->>'name','Implantação anterior — sem contrato'),'modules',CASE WHEN s.tenant_id IS NULL THEN to_jsonb(ARRAY['inventory','pos','purchasing','finance','fiscal','lots','supermarket','network','crm','reports']) WHEN s.state IN('active','trial') AND finance.today() BETWEEN s.starts_on AND s.ends_on THEN to_jsonb(s.enabled_modules) ELSE '[]'::jsonb END,'branding',brand);
END $$;
CREATE FUNCTION commercial.usage(net uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('users',(SELECT count(*) FROM identity.memberships WHERE tenant_id=net AND active),'units',(SELECT count(*) FROM organizations.units WHERE tenant_id=net AND active),'products',(SELECT count(*) FROM inventory.products WHERE tenant_id=net AND active))
$$;
CREATE FUNCTION commercial.plan_json(p commercial.plans) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'modules',p.modules,'limits',p.limits,'monthlyPrice',p.monthly_price::text,'active',p.active,'version',p.version)
$$;
INSERT INTO commercial.plans(name,description,modules,limits) VALUES
 ('Essencial','Pequenos comércios, PDV mobile, estoque, caixa e relatórios.',ARRAY['inventory','pos','finance','reports'],'{"users":null,"units":null,"products":null}'),
 ('Comércio','Compras, fornecedores, financeiro e relacionamento comercial.',ARRAY['inventory','pos','purchasing','finance','crm','reports'],'{"users":null,"units":null,"products":null}'),
 ('Supermercado','Fiscal, lotes, validade, setores, pesagem e produção.',ARRAY['inventory','pos','purchasing','finance','fiscal','lots','supermarket','crm','reports'],'{"users":null,"units":null,"products":null}'),
 ('Rede','Matriz, filiais, centros de distribuição e compras centralizadas.',ARRAY['inventory','pos','purchasing','finance','fiscal','lots','supermarket','network','crm','reports'],'{"users":null,"units":null,"products":null}');
ALTER TABLE audit.events DROP CONSTRAINT events_category_check;
ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases','sales','cash','finance','fiscal','customers','reports','commercial'));
CREATE FUNCTION commercial.capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE a jsonb:=to_jsonb(NEW);b jsonb;net uuid;actor uuid:=identity.current_auth_actor_id();who text;act text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 net:=(a->>'tenant_id')::uuid;SELECT display_name INTO who FROM identity.users WHERE id=actor;
 -- Arquivos PNG ficam fora dos dois históricos; apenas presença e alteração são registradas.
 IF TG_TABLE_NAME='brandings' THEN a:=(a-'logo_png')||jsonb_build_object('has_logo',NEW.logo_png<>'','logo_changed',TG_OP='INSERT' OR NEW.logo_png IS DISTINCT FROM b->>'logo_png');b:=(b-'logo_png')||jsonb_build_object('has_logo',coalesce(b->>'logo_png','')<>'');END IF;
 act:='commercial_'||TG_TABLE_NAME||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END;
 INSERT INTO commercial.events(tenant_id,actor_id,actor_name,action,before_data,after_data,request_id) VALUES(net,actor,coalesce(who,'Processo interno'),act,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 INSERT INTO audit.events(tenant_id,subject_user_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(net,CASE WHEN net IS NULL THEN actor END,actor,coalesce(who,'Processo interno'),coalesce(a->>'name',a->>'display_name','Assinatura'),'commercial',TG_TABLE_NAME,coalesce((a->>'id')::uuid,net),act,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_commercial_plans AFTER INSERT OR UPDATE ON commercial.plans FOR EACH ROW EXECUTE FUNCTION commercial.capture();
CREATE TRIGGER audit_capture_commercial_subscriptions AFTER INSERT OR UPDATE ON commercial.subscriptions FOR EACH ROW EXECUTE FUNCTION commercial.capture();
CREATE TRIGGER audit_capture_commercial_brandings AFTER INSERT OR UPDATE ON commercial.brandings FOR EACH ROW EXECUTE FUNCTION commercial.capture();
CREATE FUNCTION commercial.save_plan(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE p commercial.plans;target uuid:=coalesce(nullif(input->>'id','')::uuid,gen_random_uuid());mods text[];BEGIN
 IF NOT commercial.is_operator() THEN RAISE EXCEPTION 'Master obrigatório com MFA' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial/plans',0));SELECT * INTO p FROM commercial.plans WHERE id=target;
 IF coalesce(p.version,0)<>(input->>'version')::integer THEN RAISE EXCEPTION 'Plano alterado. Atualize antes de salvar.' USING ERRCODE='40001';END IF;
 SELECT array_agg(x) INTO mods FROM jsonb_array_elements_text(input->'modules') x;
 INSERT INTO commercial.plans(id,name,description,modules,limits,monthly_price,active) VALUES(target,input->>'name',input->>'description',mods,input->'limits',nullif(input->>'monthlyPrice','')::numeric,(input->>'active')::boolean)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,modules=EXCLUDED.modules,limits=EXCLUDED.limits,monthly_price=EXCLUDED.monthly_price,active=EXCLUDED.active,version=commercial.plans.version+1 RETURNING * INTO p;
 RETURN commercial.plan_json(p);
END $$;
CREATE FUNCTION commercial.save_subscription(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=(input->>'tenantId')::uuid;s commercial.subscriptions;p commercial.plans;mods text[];used jsonb;k text;BEGIN
 IF NOT commercial.is_operator() THEN RAISE EXCEPTION 'Master obrigatório com MFA' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(net::text,0));
 IF NOT EXISTS(SELECT 1 FROM tenancy.tenants WHERE id=net AND active) THEN RAISE EXCEPTION 'Rede indisponível' USING ERRCODE='P0002';END IF;
 SELECT * INTO s FROM commercial.subscriptions WHERE tenant_id=net;
 IF coalesce(s.version,0)<>(input->>'version')::integer THEN RAISE EXCEPTION 'Assinatura alterada. Atualize antes de salvar.' USING ERRCODE='40001';END IF;
 SELECT * INTO p FROM commercial.plans WHERE id=(input->>'planId')::uuid FOR SHARE;
 IF p.id IS NULL OR NOT p.active OR p.version<>(input->>'planVersion')::integer THEN RAISE EXCEPTION 'Plano indisponível ou alterado. Atualize.' USING ERRCODE='40001';END IF;
 SELECT array_agg(x) INTO mods FROM jsonb_array_elements_text(input->'enabledModules') x;
 IF NOT mods <@ p.modules THEN RAISE EXCEPTION 'Módulo fora do plano contratado' USING ERRCODE='23514';END IF;
 used:=commercial.usage(net);FOREACH k IN ARRAY ARRAY['users','units','products'] LOOP IF p.limits->k<>'null'::jsonb AND (used->>k)::integer>(p.limits->>k)::integer THEN RAISE EXCEPTION 'Uso atual excede o limite de %; ajuste o plano ou os cadastros ativos.',k USING ERRCODE='23514';END IF;END LOOP;
 INSERT INTO commercial.subscriptions(tenant_id,plan_id,plan_snapshot,enabled_modules,state,starts_on,ends_on,reason) VALUES(net,p.id,commercial.plan_json(p),mods,input->>'state',(input->>'startsOn')::date,(input->>'endsOn')::date,input->>'reason')
 ON CONFLICT(tenant_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,plan_snapshot=EXCLUDED.plan_snapshot,enabled_modules=EXCLUDED.enabled_modules,state=EXCLUDED.state,starts_on=EXCLUDED.starts_on,ends_on=EXCLUDED.ends_on,reason=EXCLUDED.reason,version=commercial.subscriptions.version+1,updated_at=now() RETURNING * INTO s;
 RETURN jsonb_build_object('tenantId',s.tenant_id,'plan',s.plan_snapshot,'enabledModules',s.enabled_modules,'state',s.state,'startsOn',s.starts_on,'endsOn',s.ends_on,'reason',s.reason,'version',s.version);
END $$;
CREATE FUNCTION commercial.save_branding(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=(input->>'tenantId')::uuid;b commercial.brandings;BEGIN
 IF NOT commercial.is_operator() AND NOT (commercial.is_owner(net) AND EXISTS(SELECT 1 FROM identity.credentials WHERE user_id=identity.current_auth_actor_id() AND mfa_secret_enc IS NOT NULL)) THEN RAISE EXCEPTION 'Personalização exige proprietário com MFA' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(net::text,0));SELECT * INTO b FROM commercial.brandings WHERE tenant_id=net;
 IF coalesce(b.version,0)<>(input->>'version')::integer THEN RAISE EXCEPTION 'Identidade alterada. Atualize antes de salvar.' USING ERRCODE='40001';END IF;
 INSERT INTO commercial.brandings(tenant_id,display_name,tagline,accent,logo_png,slug) VALUES(net,input->>'displayName',input->>'tagline',input->>'accent',input->>'logoPng',nullif(input->>'slug',''))
 ON CONFLICT(tenant_id) DO UPDATE SET display_name=EXCLUDED.display_name,tagline=EXCLUDED.tagline,accent=EXCLUDED.accent,logo_png=EXCLUDED.logo_png,slug=EXCLUDED.slug,version=commercial.brandings.version+1 RETURNING * INTO b;
 RETURN jsonb_build_object('displayName',b.display_name,'tagline',b.tagline,'accent',b.accent,'logoPng',b.logo_png,'slug',coalesce(b.slug,''),'version',b.version);
END $$;
CREATE FUNCTION commercial.directory(q text,p integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE result jsonb;BEGIN
 IF NOT commercial.is_operator() THEN RAISE EXCEPTION 'Master obrigatório' USING ERRCODE='42501';END IF;
 IF length(q)>100 OR p NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Filtro inválido' USING ERRCODE='23514';END IF;
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM (SELECT t.id,t.name,t.active,s.state,coalesce(s.plan_snapshot->>'name','Sem contrato') AS "planName" FROM tenancy.tenants t LEFT JOIN commercial.subscriptions s ON s.tenant_id=t.id WHERE q='' OR position(lower(q) in lower(t.name))>0 ORDER BY t.name,t.id LIMIT 20 OFFSET p*20) x),'[]'::jsonb),'total',(SELECT count(*) FROM tenancy.tenants WHERE q='' OR position(lower(q) in lower(name))>0),'page',p) INTO result;RETURN result;
END $$;
-- Limites são verificações de escrita, não remoção automática de registros.
CREATE FUNCTION commercial.enforce_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=NEW.tenant_id;s commercial.subscriptions;k text;used jsonb;BEGIN
 IF NOT NEW.active THEN RETURN NEW;END IF;IF TG_OP='UPDATE' AND OLD.active THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(net::text,0));SELECT * INTO s FROM commercial.subscriptions WHERE tenant_id=net;IF s.tenant_id IS NULL THEN RETURN NEW;END IF;
 IF s.state NOT IN('trial','active') OR finance.today() NOT BETWEEN s.starts_on AND s.ends_on THEN RAISE EXCEPTION 'Assinatura indisponível para novos cadastros' USING ERRCODE='P1301';END IF;
 k:=CASE TG_TABLE_NAME WHEN 'memberships' THEN 'users' WHEN 'units' THEN 'units' ELSE 'products' END;used:=commercial.usage(net);
 IF s.plan_snapshot->'limits'->k<>'null'::jsonb AND (used->>k)::integer>=(s.plan_snapshot->'limits'->>k)::integer THEN RAISE EXCEPTION 'Limite de % do plano atingido.',k USING ERRCODE='P1301';END IF;RETURN NEW;
END $$;
CREATE TRIGGER commercial_limit_users BEFORE INSERT OR UPDATE OF active ON identity.memberships FOR EACH ROW EXECUTE FUNCTION commercial.enforce_limit();
CREATE TRIGGER commercial_limit_units BEFORE INSERT OR UPDATE OF active ON organizations.units FOR EACH ROW EXECUTE FUNCTION commercial.enforce_limit();
CREATE TRIGGER commercial_limit_products BEFORE INSERT OR UPDATE OF active ON inventory.products FOR EACH ROW EXECUTE FUNCTION commercial.enforce_limit();
-- A guarda compartilhada de permissões passa a considerar a contratação.
CREATE OR REPLACE FUNCTION inventory.allowed(network uuid,permission text,branch uuid DEFAULT NULL,global_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT network=identity.current_auth_tenant_id() AND commercial.module_allowed(network,commercial.permission_module(permission)) AND EXISTS(
 SELECT 1 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id JOIN tenancy.tenants t ON t.id=m.tenant_id LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
 WHERE m.tenant_id=network AND m.user_id=identity.current_auth_actor_id() AND m.active AND u.active AND t.active AND (m.is_owner OR permission=ANY(r.permissions)) AND (NOT global_only OR m.is_owner OR m.all_units)
 AND (branch IS NULL OR (organizations.unit_available(branch) AND (m.is_owner OR m.all_units OR EXISTS(SELECT 1 FROM organizations.membership_units a WHERE a.tenant_id=m.tenant_id AND a.membership_id=m.id AND a.unit_id=branch)))))
$$;
DO $$DECLARE r record;definition text;feature text;BEGIN
 -- RPCs de módulos especializados que compartilham stock.* recebem guarda própria.
 FOR r IN SELECT p.oid,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN('network','supermarket') AND l.lanname='plpgsql' AND p.prorettype<>'trigger'::regtype LOOP
  feature:=CASE r.nspname WHEN 'network' THEN 'network' ELSE 'supermarket' END;definition:=pg_get_functiondef(r.oid);
  definition:=regexp_replace(definition,'\mBEGIN\M',format('BEGIN IF NOT commercial.module_allowed(identity.current_auth_tenant_id(),%L) THEN RAISE EXCEPTION ''Módulo não contratado ou assinatura indisponível'' USING ERRCODE=''42501''; END IF;',feature),'i');EXECUTE definition;
 END LOOP;
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN('network','supermarket') LOOP
  EXECUTE format('CREATE POLICY commercial_module_gate ON %I.%I AS RESTRICTIVE TO invictus_auth USING(commercial.module_allowed(tenant_id,%L)) WITH CHECK(commercial.module_allowed(tenant_id,%L))',r.nspname,r.relname,CASE r.nspname WHEN 'network' THEN 'network' ELSE 'supermarket' END,CASE r.nspname WHEN 'network' THEN 'network' ELSE 'supermarket' END);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA commercial FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.is_operator(),commercial.is_owner(uuid),commercial.module_allowed(uuid,text),commercial.license(uuid),commercial.permission_module(text),commercial.save_plan(jsonb),commercial.save_subscription(jsonb),commercial.save_branding(jsonb),commercial.directory(text,integer),commercial.plan_json(commercial.plans) TO invictus_auth;
-- Uso do cliente só por proprietário da rede ou Master, sem expor tabelas operacionais.
CREATE FUNCTION commercial.read_usage(net uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT commercial.is_operator() AND NOT commercial.is_owner(net) THEN RAISE EXCEPTION 'Uso não autorizado' USING ERRCODE='42501';END IF;RETURN commercial.usage(net);END $$;
REVOKE ALL ON FUNCTION commercial.read_usage(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION commercial.read_usage(uuid) TO invictus_auth;

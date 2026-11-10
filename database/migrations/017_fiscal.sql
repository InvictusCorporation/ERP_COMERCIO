-- NF-e/NFC-e: preparação local e integração de homologação; sem autorização fictícia.
CREATE SCHEMA fiscal;REVOKE ALL ON SCHEMA fiscal FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read','products.read','products.manage','stock.read','stock.manage','suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive','pos.read','pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund','finance.read','finance.manage','finance.settle','finance.reverse','finance.cash','fiscal.read','fiscal.manage','fiscal.issue','fiscal.cancel']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT fiscal_dependencies CHECK((NOT(permissions && ARRAY['fiscal.manage','fiscal.issue','fiscal.cancel']::text[]) OR 'fiscal.read'=ANY(permissions)) AND (NOT 'fiscal.manage'=ANY(permissions) OR 'products.read'=ANY(permissions)));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=permissions||ARRAY['fiscal.read','fiscal.manage','fiscal.issue','fiscal.cancel']::text[] WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE fiscal.issuer_profiles(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),version integer NOT NULL DEFAULT 1,reviewed_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,unit_id),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE TABLE fiscal.product_profiles(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,product_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),version integer NOT NULL DEFAULT 1,reviewed_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,unit_id,product_id),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id)
);
CREATE TABLE fiscal.documents(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,sale_id uuid NOT NULL,reference text NOT NULL DEFAULT ('INV-'||replace(gen_random_uuid()::text,'-','')),
 model text NOT NULL CHECK(model IN('55','65')),environment text NOT NULL DEFAULT 'homologation' CHECK(environment='homologation'),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','processing','authorized','rejected','cancel_pending','cancelled','uncertain','discarded')),
 snapshot jsonb NOT NULL,payload jsonb NOT NULL,validation_errors jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1,total numeric(15,2) NOT NULL CHECK(total>0),issuer_cnpj text NOT NULL,
 access_key text,protocol text,number text,series text,cancel_protocol text,sefaz_code text,message text NOT NULL DEFAULT '',xml_path text,danfe_path text,xml_cancel_path text,qr_url text,
 active_operation_id uuid,reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(reference),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,sale_id) REFERENCES pos.sales(tenant_id,id),CHECK(state<>'authorized' OR (access_key IS NOT NULL AND protocol IS NOT NULL))
);
CREATE UNIQUE INDEX fiscal_one_active_sale ON fiscal.documents(tenant_id,sale_id) WHERE state NOT IN('discarded','cancelled');
CREATE INDEX fiscal_documents_unit ON fiscal.documents(tenant_id,unit_id,created_at DESC,id DESC);
CREATE TABLE fiscal.operations(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,document_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('issue','consult','cancel')),
 state text NOT NULL DEFAULT 'started' CHECK(state IN('started','done','uncertain')),request_key uuid NOT NULL,request_payload jsonb NOT NULL,dispatch_payload jsonb NOT NULL,result jsonb,
 actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,lease_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '30 seconds'),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,document_id) REFERENCES fiscal.documents(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
ALTER TABLE fiscal.documents ADD CONSTRAINT fiscal_active_operation FOREIGN KEY(tenant_id,active_operation_id) REFERENCES fiscal.operations(tenant_id,id);
GRANT USAGE ON SCHEMA fiscal TO invictus_auth;GRANT SELECT ON ALL TABLES IN SCHEMA fiscal TO invictus_auth;
DO $$DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['issuer_profiles','product_profiles','documents','operations'] LOOP
 EXECUTE format('ALTER TABLE fiscal.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE fiscal.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY fiscal_read ON fiscal.%I FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,''fiscal.read'',unit_id))',tab);
 EXECUTE format('CREATE POLICY fiscal_internal ON fiscal.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
END LOOP;END $$;
CREATE FUNCTION fiscal.require_action(permission text,branch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN IF NOT inventory.allowed(identity.current_auth_tenant_id(),permission,branch) THEN RAISE EXCEPTION 'Ação fiscal não autorizada' USING ERRCODE='42501';END IF;END $$;
CREATE FUNCTION fiscal.save_profile(input jsonb,product boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;target uuid;who text;BEGIN
 PERFORM fiscal.require_action('fiscal.manage',branch);SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF product THEN
 IF NOT inventory.allowed(network,'products.read',branch) OR NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=(input->>'productId')::uuid AND active) THEN RAISE EXCEPTION 'Produto indisponível' USING ERRCODE='23514';END IF;
 INSERT INTO fiscal.product_profiles(tenant_id,unit_id,product_id,data,reviewed_by) VALUES(network,branch,(input->>'productId')::uuid,input->'data',who) ON CONFLICT(tenant_id,unit_id,product_id) DO UPDATE SET data=EXCLUDED.data,reviewed_by=who,version=product_profiles.version+1,updated_at=clock_timestamp() WHERE product_profiles.version=(input->>'version')::integer RETURNING id INTO target;
 ELSE
 INSERT INTO fiscal.issuer_profiles(tenant_id,unit_id,data,reviewed_by) VALUES(network,branch,input->'data',who) ON CONFLICT(tenant_id,unit_id) DO UPDATE SET data=EXCLUDED.data,reviewed_by=who,version=issuer_profiles.version+1,updated_at=clock_timestamp() WHERE issuer_profiles.version=(input->>'version')::integer RETURNING id INTO target;
 END IF;
 IF target IS NULL THEN RAISE EXCEPTION 'Cadastro fiscal desatualizado' USING ERRCODE='23514';END IF;RETURN target;
END $$;
CREATE FUNCTION fiscal.save_document(input jsonb,prepared jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s pos.sales;d fiscal.documents;target uuid:=(input->>'id')::uuid;BEGIN
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=(input->>'saleId')::uuid FOR UPDATE;PERFORM fiscal.require_action('fiscal.manage',s.unit_id);
 IF s.id IS NULL OR s.status<>'confirmed' OR NOT inventory.allowed(network,'pos.read',s.unit_id) THEN RAISE EXCEPTION 'Venda confirmada e consulta de PDV necessárias' USING ERRCODE='23514';END IF;
 IF target IS NULL THEN
 SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF d.id IS NOT NULL THEN IF d.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN d.id;END IF;
 INSERT INTO fiscal.documents(tenant_id,unit_id,sale_id,model,snapshot,payload,validation_errors,total,issuer_cnpj,request_key,request_payload) VALUES(network,s.unit_id,s.id,input->>'model',prepared->'snapshot',prepared->'payload',prepared->'errors',s.total,prepared->>'issuerCnpj',(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE
 SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND id=target FOR UPDATE;
 IF d.id IS NULL OR d.sale_id<>s.id OR d.state NOT IN('draft','rejected') OR d.version<>(input->>'version')::integer OR d.model<>input->>'model' THEN RAISE EXCEPTION 'Documento não pode ser alterado neste estado' USING ERRCODE='23514';END IF;
 UPDATE fiscal.documents SET snapshot=prepared->'snapshot',payload=prepared->'payload',validation_errors=prepared->'errors',issuer_cnpj=prepared->>'issuerCnpj',state='draft',version=version+1,message='',updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;
CREATE FUNCTION fiscal.discard(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();d fiscal.documents;BEGIN
 SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND id=(input->>'documentId')::uuid FOR UPDATE;PERFORM fiscal.require_action('fiscal.manage',d.unit_id);
 IF d.state='discarded' AND d.reason=input->>'reason' THEN RETURN d.id;END IF;
 IF d.id IS NULL OR d.state NOT IN('draft','rejected') OR d.version<>(input->>'version')::integer THEN RAISE EXCEPTION 'Somente rascunho ou rejeição conhecida podem ser descartados' USING ERRCODE='23514';END IF;
 UPDATE fiscal.documents SET state='discarded',reason=input->>'reason',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=d.id;RETURN d.id;
END $$;
CREATE FUNCTION fiscal.queue_operation(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();d fiscal.documents;o fiscal.operations;who text;target uuid;kind_name text:=input->>'kind';dispatch_body jsonb;BEGIN
 SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND id=(input->>'documentId')::uuid FOR UPDATE;PERFORM fiscal.require_action(CASE WHEN kind_name='cancel' THEN 'fiscal.cancel' ELSE 'fiscal.issue' END,d.unit_id);
 SELECT * INTO o FROM fiscal.operations WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF o.id IS NOT NULL THEN IF o.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN jsonb_build_object('id',o.id,'dispatch',false);END IF;
 IF d.id IS NULL OR d.state='discarded' OR (d.active_operation_id IS NOT NULL AND EXISTS(SELECT 1 FROM fiscal.operations WHERE tenant_id=network AND id=d.active_operation_id AND state='started' AND lease_until>clock_timestamp())) THEN RAISE EXCEPTION 'Documento ou operação ainda em andamento' USING ERRCODE='23514';END IF;
 IF kind_name<>'consult' AND d.version<>(input->>'version')::integer THEN RAISE EXCEPTION 'Documento desatualizado' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM fiscal.operations WHERE tenant_id=network AND document_id=d.id)>=100 THEN RAISE EXCEPTION 'Limite de operações fiscais atingido' USING ERRCODE='23514';END IF;
 IF kind_name='issue' THEN
 IF d.state<>'draft' OR jsonb_array_length(d.validation_errors)>0 OR NOT EXISTS(SELECT 1 FROM pos.sales WHERE tenant_id=network AND id=d.sale_id AND status='confirmed') THEN RAISE EXCEPTION 'Conclua a conferência fiscal de uma venda confirmada' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM fiscal.issuer_profiles WHERE tenant_id=network AND unit_id=d.unit_id AND version=(d.snapshot->>'issuerVersion')::integer) OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'profiles') x WHERE NOT EXISTS(SELECT 1 FROM fiscal.product_profiles p WHERE p.tenant_id=network AND p.unit_id=d.unit_id AND p.product_id=(x->>'productId')::uuid AND p.version=(x->>'version')::integer)) THEN RAISE EXCEPTION 'Cadastros fiscais mudaram. Atualize a conferência' USING ERRCODE='23514';END IF;
 dispatch_body:=d.payload||jsonb_build_object('data_emissao',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
 ELSIF kind_name='cancel' THEN
 IF d.state<>'authorized' OR length(btrim(input->>'reason')) NOT BETWEEN 15 AND 255 THEN RAISE EXCEPTION 'Autorização e justificativa de cancelamento necessárias' USING ERRCODE='23514';END IF;dispatch_body:=jsonb_build_object('justificativa',input->>'reason');
 ELSE
 IF kind_name<>'consult' OR d.state='draft' THEN RAISE EXCEPTION 'Documento ainda não transmitido' USING ERRCODE='23514';END IF;dispatch_body:='{}';
 END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO fiscal.operations(tenant_id,unit_id,document_id,kind,request_key,request_payload,dispatch_payload,actor_name) VALUES(network,d.unit_id,d.id,kind_name,(input->>'requestKey')::uuid,input,dispatch_body,who) RETURNING id INTO target;
 UPDATE fiscal.documents SET active_operation_id=target,state=CASE kind_name WHEN 'issue' THEN 'processing' WHEN 'cancel' THEN 'cancel_pending' ELSE state END,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=d.id;RETURN jsonb_build_object('id',target,'dispatch',true);
END $$;
CREATE FUNCTION fiscal.record_result(target uuid,outcome jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();o fiscal.operations;d fiscal.documents;next_state text:=outcome->>'state';BEGIN
 SELECT * INTO o FROM fiscal.operations WHERE tenant_id=network AND id=target FOR UPDATE;SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND id=o.document_id FOR UPDATE;
 PERFORM fiscal.require_action(CASE WHEN o.kind='cancel' THEN 'fiscal.cancel' ELSE 'fiscal.issue' END,d.unit_id);
 IF o.id IS NULL OR o.state<>'started' THEN RETURN d.id;END IF;
 UPDATE fiscal.operations SET state=CASE next_state WHEN 'uncertain' THEN 'uncertain' ELSE 'done' END,result=outcome,finished_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 IF d.active_operation_id<>target THEN RETURN d.id;END IF;
 IF next_state NOT IN('processing','authorized','rejected','cancelled','uncertain') THEN RAISE EXCEPTION 'Retorno fiscal inválido' USING ERRCODE='23514';END IF;
 IF d.state='cancelled' THEN next_state:='cancelled';END IF;
 IF d.access_key IS NOT NULL AND next_state='rejected' THEN next_state:='uncertain';END IF;
 UPDATE fiscal.documents SET state=next_state,access_key=coalesce(outcome->>'key',access_key),protocol=coalesce(outcome->>'protocol',protocol),cancel_protocol=coalesce(outcome->>'cancelProtocol',cancel_protocol),number=coalesce(outcome->>'number',number),series=coalesce(outcome->>'series',series),sefaz_code=outcome->>'sefazCode',message=outcome->>'message',xml_path=coalesce(outcome->>'xmlPath',xml_path),danfe_path=coalesce(outcome->>'danfePath',danfe_path),xml_cancel_path=coalesce(outcome->>'cancelXmlPath',xml_cancel_path),qr_url=coalesce(outcome->>'qrUrl',qr_url),version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=d.id;RETURN d.id;
END $$;
CREATE FUNCTION fiscal.guard_sale_return() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF OLD.status='confirmed' AND NEW.status='returned' AND EXISTS(SELECT 1 FROM fiscal.documents WHERE tenant_id=NEW.tenant_id AND sale_id=NEW.id AND state IN('processing','authorized','cancel_pending','uncertain')) THEN RAISE EXCEPTION 'Regularize o documento fiscal antes de devolver a venda' USING ERRCODE='P0701';END IF;RETURN NEW;END $$;
CREATE TRIGGER fiscal_sale_return BEFORE UPDATE ON pos.sales FOR EACH ROW EXECUTE FUNCTION fiscal.guard_sale_return();
ALTER TABLE audit.events DROP CONSTRAINT events_category_check;ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases','sales','cash','finance','fiscal'));
CREATE FUNCTION fiscal.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];who text;source text;label text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 CASE TG_TABLE_NAME WHEN 'issuer_profiles' THEN source:='fiscal_issuer';label:='Emitente fiscal';keys:=ARRAY['data','version','reviewed_by'];
 WHEN 'product_profiles' THEN source:='fiscal_product';label:='Tributação do produto';keys:=ARRAY['product_id','data','version','reviewed_by'];
 WHEN 'documents' THEN source:='fiscal_document';label:=NEW.reference;keys:=ARRAY['sale_id','model','environment','state','total','issuer_cnpj','access_key','protocol','number','series','cancel_protocol','sefaz_code','message','reason'];
 ELSE source:='fiscal_operation';label:='Operação fiscal';keys:=ARRAY['document_id','kind','state','finished_at'];END CASE;
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,'fiscal',source,NEW.id,source||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_fiscal_issuer AFTER INSERT OR UPDATE ON fiscal.issuer_profiles FOR EACH ROW EXECUTE FUNCTION fiscal.capture_audit();
CREATE TRIGGER audit_capture_fiscal_product AFTER INSERT OR UPDATE ON fiscal.product_profiles FOR EACH ROW EXECUTE FUNCTION fiscal.capture_audit();
CREATE TRIGGER audit_capture_fiscal_document AFTER INSERT OR UPDATE ON fiscal.documents FOR EACH ROW EXECUTE FUNCTION fiscal.capture_audit();
CREATE TRIGGER audit_capture_fiscal_operation AFTER INSERT OR UPDATE ON fiscal.operations FOR EACH ROW EXECUTE FUNCTION fiscal.capture_audit();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fiscal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fiscal.save_profile(jsonb,boolean),fiscal.save_document(jsonb,jsonb),fiscal.discard(jsonb),fiscal.queue_operation(jsonb),fiscal.record_result(uuid,jsonb) TO invictus_auth;

CREATE FUNCTION fiscal.mark_download(target uuid,kind_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();d fiscal.documents;who text;BEGIN
 SELECT * INTO d FROM fiscal.documents WHERE tenant_id=network AND id=target;PERFORM fiscal.require_action('fiscal.read',d.unit_id);
 IF d.id IS NULL OR kind_name NOT IN('xml','danfe','cancelXml') THEN RAISE EXCEPTION 'Arquivo indisponível' USING ERRCODE='42501';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,after_data,request_id) VALUES(network,d.unit_id,identity.current_auth_actor_id(),who,d.reference,'fiscal','fiscal_document',d.id,'fiscal_document.downloaded',jsonb_build_object('artifact',kind_name),nullif(current_setting('app.audit_request_id',true),'')::uuid);
END $$;
REVOKE ALL ON FUNCTION fiscal.mark_download(uuid,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION fiscal.mark_download(uuid,text) TO invictus_auth;

CREATE SCHEMA purchasing;
REVOKE ALL ON SCHEMA purchasing FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read','products.read','products.manage','stock.read','stock.manage','suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT supplier_manage_read CHECK(NOT 'suppliers.manage'=ANY(permissions) OR 'suppliers.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT purchase_read_dependencies CHECK(NOT 'purchases.read'=ANY(permissions) OR ('suppliers.read'=ANY(permissions) AND 'products.read'=ANY(permissions)));
ALTER TABLE access.roles ADD CONSTRAINT purchase_write_read CHECK(NOT (permissions && ARRAY['purchases.manage','purchases.approve','purchases.receive']::text[]) OR 'purchases.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT purchase_receive_stock CHECK(NOT 'purchases.receive'=ANY(permissions) OR 'stock.manage'=ANY(permissions));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=permissions||ARRAY['suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive']::text[] WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE purchasing.suppliers(
 tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 legal_name text NOT NULL CHECK(length(btrim(legal_name)) BETWEEN 1 AND 160),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 cnpj text NOT NULL CHECK(cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),state_registration text NOT NULL DEFAULT '' CHECK(length(state_registration)<=30),
 contact_name text NOT NULL DEFAULT '' CHECK(length(contact_name)<=100),email text NOT NULL DEFAULT '' CHECK(length(email)<=254),phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=240),city text NOT NULL DEFAULT '' CHECK(length(city)<=100),state text NOT NULL DEFAULT '' CHECK(state='' OR state ~ '^[A-Z]{2}$'),postal_code text NOT NULL DEFAULT '' CHECK(postal_code='' OR postal_code ~ '^[0-9]{8}$'),
 delivery_days integer NOT NULL DEFAULT 0 CHECK(delivery_days BETWEEN 0 AND 365),payment_terms text NOT NULL DEFAULT '' CHECK(length(payment_terms)<=200),notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,cnpj)
);
CREATE TABLE purchasing.orders(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,supplier_id uuid NOT NULL,
 number text NOT NULL DEFAULT ('PC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 supplier_snapshot jsonb NOT NULL,items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','partial','received','cancelled')),
 freight numeric(15,2) NOT NULL CHECK(freight>=0),extra_cost numeric(15,2) NOT NULL CHECK(extra_cost>=0),discount numeric(15,2) NOT NULL CHECK(discount>=0),total numeric(24,6) NOT NULL CHECK(total>=0),
 expected_date date,notes text NOT NULL DEFAULT '',cancel_reason text,version integer NOT NULL DEFAULT 1,
 actor_id uuid NOT NULL REFERENCES identity.users(id),actor_name text NOT NULL,approved_by text,approved_at timestamptz,
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,supplier_id) REFERENCES purchasing.suppliers(tenant_id,id)
);
CREATE INDEX orders_unit_time ON purchasing.orders(tenant_id,unit_id,created_at DESC,id DESC);
CREATE TABLE purchasing.receipts(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),order_id uuid NOT NULL,unit_id uuid NOT NULL,
 items jsonb NOT NULL,status text NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','reversed')),
 document text NOT NULL CHECK(length(btrim(document)) BETWEEN 1 AND 120),notes text NOT NULL CHECK(length(btrim(notes)) BETWEEN 3 AND 300),
 total numeric(24,6) NOT NULL CHECK(total>=0),actor_id uuid NOT NULL REFERENCES identity.users(id),actor_name text NOT NULL,
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,reversal_key uuid,reversal_reason text,reversed_by text,reversed_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,reversal_key),FOREIGN KEY(tenant_id,order_id) REFERENCES purchasing.orders(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE INDEX receipts_order_time ON purchasing.receipts(tenant_id,order_id,created_at DESC,id DESC);
ALTER TABLE inventory.movements ADD COLUMN purchase_receipt_id uuid;
ALTER TABLE inventory.movements ADD COLUMN purchase_line_id uuid;
ALTER TABLE inventory.movements ADD CONSTRAINT movement_purchase_source FOREIGN KEY(tenant_id,purchase_receipt_id) REFERENCES purchasing.receipts(tenant_id,id);
ALTER TABLE inventory.movements ADD CONSTRAINT movement_purchase_pair CHECK((purchase_receipt_id IS NULL)=(purchase_line_id IS NULL));
CREATE UNIQUE INDEX movement_purchase_unique ON inventory.movements(tenant_id,purchase_receipt_id,purchase_line_id) WHERE kind='entry';
GRANT USAGE ON SCHEMA purchasing TO invictus_auth;
GRANT SELECT,INSERT,UPDATE ON purchasing.suppliers TO invictus_auth;
GRANT SELECT ON purchasing.orders,purchasing.receipts TO invictus_auth;
ALTER TABLE purchasing.suppliers ENABLE ROW LEVEL SECURITY;ALTER TABLE purchasing.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE purchasing.orders ENABLE ROW LEVEL SECURITY;ALTER TABLE purchasing.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE purchasing.receipts ENABLE ROW LEVEL SECURITY;ALTER TABLE purchasing.receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_read ON purchasing.suppliers FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'suppliers.read'));
CREATE POLICY supplier_insert ON purchasing.suppliers FOR INSERT TO invictus_auth WITH CHECK(inventory.allowed(tenant_id,'suppliers.manage',NULL,true));
CREATE POLICY supplier_update ON purchasing.suppliers FOR UPDATE TO invictus_auth USING(inventory.allowed(tenant_id,'suppliers.manage',NULL,true)) WITH CHECK(inventory.allowed(tenant_id,'suppliers.manage',NULL,true));
CREATE POLICY orders_read ON purchasing.orders FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'purchases.read',unit_id));
CREATE POLICY receipts_read ON purchasing.receipts FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'purchases.read',unit_id));
CREATE POLICY suppliers_internal ON purchasing.suppliers TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY orders_internal ON purchasing.orders TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY receipts_internal ON purchasing.receipts TO invictus_migrator USING(true) WITH CHECK(true);
CREATE FUNCTION purchasing.supplier_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.cnpj<>OLD.cnpj OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Identidade permanente ou versão inválida' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER supplier_guard BEFORE UPDATE ON purchasing.suppliers FOR EACH ROW EXECUTE FUNCTION purchasing.supplier_guard();
REVOKE ALL ON FUNCTION purchasing.supplier_guard() FROM PUBLIC;

CREATE FUNCTION purchasing.save_order(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id(); branch uuid:=(input->>'unitId')::uuid; supplier uuid:=(input->>'supplierId')::uuid; target uuid:=(input->>'id')::uuid;
 old purchasing.orders;s purchasing.suppliers;p inventory.products;line jsonb;result jsonb:='[]';base numeric:=0;amount numeric;factor numeric;quantity numeric;cost numeric;net numeric;who text;
BEGIN
 IF NOT inventory.allowed(network,'purchases.manage',branch) THEN RAISE EXCEPTION 'Compra não autorizada' USING ERRCODE='42501';END IF;
 IF target IS NULL THEN
  SELECT * INTO old FROM purchasing.orders WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
  IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 ELSE
  SELECT * INTO old FROM purchasing.orders WHERE tenant_id=network AND id=target FOR UPDATE;
  IF old.id IS NULL OR old.unit_id<>branch OR old.supplier_id<>supplier OR old.status<>'draft' OR old.version<>(input->>'version')::integer THEN RAISE EXCEPTION 'Rascunho indisponível ou desatualizado' USING ERRCODE='23514';END IF;
 END IF;
 SELECT * INTO s FROM purchasing.suppliers WHERE tenant_id=network AND id=supplier AND active FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Fornecedor inativo ou indisponível' USING ERRCODE='23514';END IF;
 IF jsonb_array_length(input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Itens inválidos' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active FOR SHARE;
  IF p.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) x WHERE x->>'productId'=p.id::text) THEN RAISE EXCEPTION 'Produto inválido ou repetido' USING ERRCODE='23514';END IF;
  factor:=CASE WHEN (line->>'packaged')::boolean THEN p.package_factor ELSE 1 END;quantity:=(line->>'quantity')::numeric;cost:=(line->>'unitCost')::numeric;
  IF quantity<=0 OR cost<0 OR quantity*factor<>round(quantity*factor,3) OR quantity*factor>999999999999.999 THEN RAISE EXCEPTION 'Quantidade ou custo inválido' USING ERRCODE='23514';END IF;
  amount:=round(quantity*cost,6);base:=base+amount;
  result:=result||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'packageName',p.package_name,'factor',factor::text,'packaged',(line->>'packaged')::boolean,'quantity',quantity::text,'unitCost',cost::text,'baseQuantity',(quantity*factor)::text,'baseValue',amount::text,'totalValue',amount::text,'receivedQuantity','0','receivedValue','0'));
 END LOOP;
 net:=base+(input->>'freight')::numeric+(input->>'extraCost')::numeric-(input->>'discount')::numeric;
 IF net<0 THEN RAISE EXCEPTION 'Desconto excede o total da compra' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF target IS NULL THEN
  INSERT INTO purchasing.orders(tenant_id,unit_id,supplier_id,supplier_snapshot,items,freight,extra_cost,discount,total,expected_date,notes,actor_id,actor_name,request_key,request_payload)
  VALUES(network,branch,supplier,jsonb_build_object('name',s.name,'legalName',s.legal_name,'cnpj',s.cnpj,'paymentTerms',s.payment_terms),result,(input->>'freight')::numeric,(input->>'extraCost')::numeric,(input->>'discount')::numeric,net,nullif(input->>'expectedDate','')::date,input->>'notes',identity.current_auth_actor_id(),who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE
  UPDATE purchasing.orders SET items=result,freight=(input->>'freight')::numeric,extra_cost=(input->>'extraCost')::numeric,discount=(input->>'discount')::numeric,total=net,expected_date=nullif(input->>'expectedDate','')::date,notes=input->>'notes',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;
CREATE FUNCTION purchasing.transition_order(target uuid,expected integer,action text,reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();o purchasing.orders;line jsonb;result jsonb:='[]';base numeric;weight numeric;denom numeric;allocated numeric:=0;cumulative numeric:=0;amount numeric;idx integer:=0;n integer;who text;
BEGIN
 SELECT * INTO o FROM purchasing.orders WHERE tenant_id=network AND id=target FOR UPDATE;
 IF o.id IS NULL OR NOT inventory.allowed(network,CASE WHEN action='approve' THEN 'purchases.approve' ELSE 'purchases.manage' END,o.unit_id) THEN RAISE EXCEPTION 'Pedido não autorizado' USING ERRCODE='42501';END IF;
 IF action NOT IN('approve','cancel') THEN RAISE EXCEPTION 'Ação inválida' USING ERRCODE='23514';END IF;
 IF o.version=expected+1 AND ((action='approve' AND o.status='approved') OR (action='cancel' AND o.status='cancelled' AND o.cancel_reason=reason)) THEN RETURN target;END IF;
 IF o.version<>expected THEN RAISE EXCEPTION 'Pedido desatualizado' USING ERRCODE='23514';END IF;
 IF action='cancel' THEN
  IF o.status NOT IN('draft','approved') OR EXISTS(SELECT 1 FROM purchasing.receipts WHERE tenant_id=network AND order_id=target AND status='confirmed') OR length(btrim(reason)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Cancelamento não permitido' USING ERRCODE='23514';END IF;
  UPDATE purchasing.orders SET status='cancelled',cancel_reason=reason,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;RETURN target;
 END IF;
 IF o.status<>'draft' OR NOT EXISTS(SELECT 1 FROM purchasing.suppliers WHERE tenant_id=network AND id=o.supplier_id AND active) THEN RAISE EXCEPTION 'Pedido ou fornecedor indisponível' USING ERRCODE='23514';END IF;
 SELECT sum((x->>'baseValue')::numeric) INTO base FROM jsonb_array_elements(o.items) x;
 denom:=base;IF denom=0 THEN SELECT sum((x->>'baseQuantity')::numeric) INTO denom FROM jsonb_array_elements(o.items) x;END IF;n:=jsonb_array_length(o.items);
 FOR line IN SELECT value FROM jsonb_array_elements(o.items) LOOP
  IF NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active) THEN RAISE EXCEPTION 'Produto indisponível' USING ERRCODE='23514';END IF;
  idx:=idx+1;weight:=CASE WHEN base>0 THEN (line->>'baseValue')::numeric ELSE (line->>'baseQuantity')::numeric END;
  cumulative:=cumulative+weight;amount:=CASE WHEN idx=n THEN o.total-allocated ELSE round(o.total*cumulative/denom,6)-allocated END;
  IF amount<0 THEN RAISE EXCEPTION 'Rateio inválido' USING ERRCODE='23514';END IF;allocated:=allocated+amount;result:=result||jsonb_build_array(line||jsonb_build_object('totalValue',amount::text));
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE purchasing.orders SET items=result,status='approved',approved_by=who,approved_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;RETURN target;
END $$;
CREATE FUNCTION purchasing.receive_order(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();o purchasing.orders;r purchasing.receipts;line jsonb;requested jsonb;result jsonb:='[]';receipt_items jsonb:='[]';q numeric;received numeric;amount numeric;total numeric:=0;remaining boolean:=false;who text;target uuid:=gen_random_uuid();movement uuid;seen uuid[]:='{}';
BEGIN
 SELECT * INTO o FROM purchasing.orders WHERE tenant_id=network AND id=(input->>'orderId')::uuid FOR UPDATE;
 IF o.id IS NULL OR NOT inventory.allowed(network,'purchases.receive',o.unit_id) OR NOT inventory.allowed(network,'stock.manage',o.unit_id) THEN RAISE EXCEPTION 'Recebimento não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM purchasing.receipts WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF r.id IS NOT NULL THEN IF r.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN r.id;END IF;
 IF o.status NOT IN('approved','partial') OR o.version<>(input->>'version')::integer OR NOT EXISTS(SELECT 1 FROM purchasing.suppliers WHERE tenant_id=network AND id=o.supplier_id AND active) THEN RAISE EXCEPTION 'Pedido desatualizado ou indisponível' USING ERRCODE='23514';END IF;
 IF jsonb_array_length(input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Itens inválidos' USING ERRCODE='23514';END IF;
 FOR requested IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  IF (requested->>'lineId')::uuid=ANY(seen) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) x WHERE x->>'id'=requested->>'lineId') THEN RAISE EXCEPTION 'Item inválido ou repetido' USING ERRCODE='23514';END IF;seen:=array_append(seen,(requested->>'lineId')::uuid);
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(o.items) LOOP
  SELECT value INTO requested FROM jsonb_array_elements(input->'items') WHERE value->>'lineId'=line->>'id';
  IF requested IS NOT NULL THEN
   q:=(requested->>'quantity')::numeric;received:=(line->>'receivedQuantity')::numeric;
   IF q<=0 OR q+received>(line->>'quantity')::numeric OR q*(line->>'factor')::numeric<>round(q*(line->>'factor')::numeric,3) THEN RAISE EXCEPTION 'Quantidade excede o saldo ou precisão' USING ERRCODE='23514';END IF;
   amount:=CASE WHEN q+received=(line->>'quantity')::numeric THEN (line->>'totalValue')::numeric-(line->>'receivedValue')::numeric ELSE round((line->>'totalValue')::numeric*(q+received)/(line->>'quantity')::numeric,6)-(line->>'receivedValue')::numeric END;
   movement:=gen_random_uuid();receipt_items:=receipt_items||jsonb_build_array(jsonb_build_object('lineId',line->>'id','productId',line->>'productId','name',line->>'name','quantity',q::text,'factor',line->>'factor','baseQuantity',(q*(line->>'factor')::numeric)::text,'totalValue',amount::text,'movementId',movement));total:=total+amount;
   line:=line||jsonb_build_object('receivedQuantity',(q+received)::text,'receivedValue',((line->>'receivedValue')::numeric+amount)::text);
  END IF;
  IF (line->>'receivedQuantity')::numeric<(line->>'quantity')::numeric THEN remaining:=true;END IF;result:=result||jsonb_build_array(line);
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO purchasing.receipts(tenant_id,id,order_id,unit_id,items,document,notes,total,actor_id,actor_name,request_key,request_payload) VALUES(network,target,o.id,o.unit_id,receipt_items,input->>'document',input->>'notes',total,identity.current_auth_actor_id(),who,(input->>'requestKey')::uuid,input);
 FOR line IN SELECT value FROM jsonb_array_elements(receipt_items) LOOP
  INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,purchase_receipt_id,purchase_line_id)
  VALUES(network,(line->>'movementId')::uuid,o.unit_id,(line->>'productId')::uuid,'entry',(line->>'baseQuantity')::numeric,false,0,'Recebimento '||o.number||' · '||(input->>'document'),gen_random_uuid(),target,(line->>'lineId')::uuid);
 END LOOP;
 UPDATE purchasing.orders SET items=result,status=CASE WHEN remaining THEN 'partial' ELSE 'received' END,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=o.id;RETURN target;
END $$;
CREATE FUNCTION purchasing.reverse_receipt(target uuid,expected integer,reason text,confirmation uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();r purchasing.receipts;o purchasing.orders;line jsonb;received jsonb;result jsonb:='[]';any_received boolean:=false;who text;
BEGIN
 SELECT * INTO r FROM purchasing.receipts WHERE tenant_id=network AND id=target FOR UPDATE;
 IF r.id IS NULL OR NOT inventory.allowed(network,'purchases.receive',r.unit_id) OR NOT inventory.allowed(network,'stock.manage',r.unit_id) THEN RAISE EXCEPTION 'Estorno não autorizado' USING ERRCODE='42501';END IF;
 IF r.status='reversed' THEN IF r.reversal_key=confirmation AND r.reversal_reason=reason THEN RETURN target;ELSE RAISE EXCEPTION 'Recebimento já estornado' USING ERRCODE='23514';END IF;END IF;
 SELECT * INTO o FROM purchasing.orders WHERE tenant_id=network AND id=r.order_id FOR UPDATE;
 IF o.version<>expected OR length(btrim(reason)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Pedido desatualizado ou motivo inválido' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE purchasing.receipts SET status='reversed',reversal_key=confirmation,reversal_reason=reason,reversed_by=who,reversed_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
  INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,reversal_of,request_key,purchase_receipt_id,purchase_line_id)
  VALUES(network,r.unit_id,(line->>'productId')::uuid,'reverse',1,false,0,left('Estorno '||o.number||' · '||reason,300),(line->>'movementId')::uuid,gen_random_uuid(),target,(line->>'lineId')::uuid);
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(o.items) LOOP
  SELECT value INTO received FROM jsonb_array_elements(r.items) WHERE value->>'lineId'=line->>'id';
  IF received IS NOT NULL THEN line:=line||jsonb_build_object('receivedQuantity',((line->>'receivedQuantity')::numeric-(received->>'quantity')::numeric)::text,'receivedValue',((line->>'receivedValue')::numeric-(received->>'totalValue')::numeric)::text);END IF;
  IF (line->>'receivedQuantity')::numeric>0 THEN any_received:=true;END IF;result:=result||jsonb_build_array(line);
 END LOOP;
 UPDATE purchasing.orders SET items=result,status=CASE WHEN any_received THEN 'partial' ELSE 'approved' END,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=o.id;RETURN target;
END $$;
REVOKE ALL ON FUNCTION purchasing.save_order(jsonb),purchasing.transition_order(uuid,integer,text,text),purchasing.receive_order(jsonb),purchasing.reverse_receipt(uuid,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchasing.save_order(jsonb),purchasing.transition_order(uuid,integer,text,text),purchasing.receive_order(jsonb),purchasing.reverse_receipt(uuid,integer,text,uuid) TO invictus_auth;

ALTER TABLE audit.events DROP CONSTRAINT events_category_check;
ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases'));
CREATE FUNCTION purchasing.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];who text;kind text;label text;category text;id uuid;
BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 IF TG_TABLE_NAME='suppliers' THEN kind:='supplier';category:='suppliers';label:=NEW.name;keys:=ARRAY['legal_name','name','cnpj','state_registration','contact_name','email','phone','address','city','state','postal_code','delivery_days','payment_terms','notes','active'];
 ELSE kind:=CASE WHEN TG_TABLE_NAME='orders' THEN 'purchase' ELSE 'receipt' END;category:='purchases';
  IF kind='purchase' THEN label:=NEW.number;ELSE SELECT number INTO label FROM purchasing.orders WHERE tenant_id=NEW.tenant_id AND id=NEW.order_id;END IF;
  keys:=ARRAY['number','supplier_snapshot','items','status','freight','extra_cost','discount','total','expected_date','notes','cancel_reason','approved_by','approved_at','document','reversal_reason','reversed_by','reversed_at'];END IF;
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);
 IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id)
 VALUES(NEW.tenant_id,(to_jsonb(NEW)->>'unit_id')::uuid,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,category,kind,NEW.id,kind||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_supplier AFTER INSERT OR UPDATE ON purchasing.suppliers FOR EACH ROW EXECUTE FUNCTION purchasing.capture_audit();
CREATE TRIGGER audit_capture_purchase AFTER INSERT OR UPDATE ON purchasing.orders FOR EACH ROW EXECUTE FUNCTION purchasing.capture_audit();
CREATE TRIGGER audit_capture_receipt AFTER INSERT OR UPDATE ON purchasing.receipts FOR EACH ROW EXECUTE FUNCTION purchasing.capture_audit();
REVOKE ALL ON FUNCTION purchasing.capture_audit() FROM PUBLIC;

CREATE OR REPLACE FUNCTION inventory.confirm_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p inventory.products; s inventory.levels; original inventory.movements; latest uuid; actor text; purchase_item jsonb; receipt purchasing.receipts;
BEGIN
 IF NOT inventory.allowed(NEW.tenant_id,'stock.manage',NEW.unit_id) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM inventory.products WHERE tenant_id=NEW.tenant_id AND id=NEW.product_id FOR SHARE;
 IF p.id IS NULL OR NOT p.active THEN RAISE EXCEPTION 'Produto inativo ou indisponível' USING ERRCODE='23514'; END IF;
 INSERT INTO inventory.levels(tenant_id,unit_id,product_id) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM inventory.levels WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
 NEW.factor:=CASE WHEN NEW.packaged THEN p.package_factor ELSE 1 END;
 NEW.base_quantity:=NEW.quantity*NEW.factor;
 IF NEW.quantity*NEW.factor<>round(NEW.quantity*NEW.factor,3) OR NEW.base_quantity<=0 THEN RAISE EXCEPTION 'Conversão ultrapassa a precisão de três casas' USING ERRCODE='23514'; END IF;
 NEW.physical_delta:=0;NEW.reserved_delta:=0;NEW.value_delta:=0;NEW.previous_last_cost:=s.last_cost;
 CASE NEW.kind
 WHEN 'entry' THEN NEW.physical_delta:=NEW.base_quantity;NEW.value_delta:=round(NEW.quantity*NEW.cost,6);s.last_cost:=round(NEW.cost/NEW.factor,6);
 IF NEW.purchase_receipt_id IS NOT NULL THEN
  SELECT * INTO receipt FROM purchasing.receipts WHERE tenant_id=NEW.tenant_id AND id=NEW.purchase_receipt_id AND unit_id=NEW.unit_id AND status='confirmed';
  SELECT value INTO purchase_item FROM jsonb_array_elements(receipt.items) WHERE value->>'lineId'=NEW.purchase_line_id::text AND value->>'productId'=NEW.product_id::text AND value->>'movementId'=NEW.id::text;
  IF purchase_item IS NULL OR (purchase_item->>'baseQuantity')::numeric<>NEW.base_quantity OR NEW.packaged THEN RAISE EXCEPTION 'Origem de compra inválida' USING ERRCODE='23514';END IF;
  NEW.value_delta:=(purchase_item->>'totalValue')::numeric;NEW.cost:=round(NEW.value_delta/NEW.base_quantity,6);s.last_cost:=NEW.cost;
 END IF;
 WHEN 'out','loss' THEN
  NEW.physical_delta:=-NEW.base_quantity;
  NEW.value_delta:=-CASE WHEN NEW.base_quantity=s.physical THEN s.value WHEN s.physical>0 THEN round(s.value*NEW.base_quantity/s.physical,6) ELSE 0 END;
 WHEN 'reserve' THEN NEW.reserved_delta:=NEW.base_quantity;
 WHEN 'release' THEN NEW.reserved_delta:=-NEW.base_quantity;
 WHEN 'reverse' THEN
  SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
  SELECT id INTO latest FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF original.id IS NULL OR original.kind='reverse' OR latest<>original.id THEN RAISE EXCEPTION 'Estorne somente o último movimento confirmado deste produto e unidade' USING ERRCODE='23514'; END IF;
  IF original.purchase_receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM purchasing.receipts r WHERE r.tenant_id=NEW.tenant_id AND r.id=original.purchase_receipt_id AND r.status='reversed' AND NEW.purchase_receipt_id=r.id AND NEW.purchase_line_id=original.purchase_line_id) THEN RAISE EXCEPTION 'Estorne pela compra para preservar o vínculo do recebimento' USING ERRCODE='23514';END IF;
  NEW.quantity:=original.quantity;NEW.packaged:=original.packaged;NEW.factor:=original.factor;NEW.base_quantity:=original.base_quantity;NEW.cost:=original.cost;
  NEW.physical_delta:=-original.physical_delta;NEW.reserved_delta:=-original.reserved_delta;NEW.value_delta:=-original.value_delta;s.last_cost:=original.previous_last_cost;
 END CASE;
 NEW.physical_after:=s.physical+NEW.physical_delta;NEW.reserved_after:=s.reserved+NEW.reserved_delta;NEW.value_after:=s.value+NEW.value_delta;
 IF NEW.physical_after<0 OR NEW.reserved_after<0 OR NEW.reserved_after>NEW.physical_after OR NEW.value_after<0 THEN RAISE EXCEPTION 'Saldo físico ou disponível insuficiente' USING ERRCODE='23514'; END IF;
 NEW.actor_id:=identity.current_auth_actor_id();SELECT display_name INTO actor FROM identity.users WHERE id=NEW.actor_id;NEW.actor_name:=actor;
 UPDATE inventory.levels SET physical=NEW.physical_after,reserved=NEW.reserved_after,value=NEW.value_after,last_cost=s.last_cost WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
 RETURN NEW;
END $$;

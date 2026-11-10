-- Etapa 11.1: relacionamento e pedidos manuais; PDV de teste permanece separado do financeiro.
CREATE SCHEMA crm;REVOKE ALL ON SCHEMA crm FROM PUBLIC;GRANT USAGE ON SCHEMA crm TO invictus_auth;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['crm.read','crm.manage','crm.credit','crm.loyalty','orders.read','orders.manage','deliveries.manage','fiscal.read','fiscal.manage','fiscal.issue','fiscal.cancel','finance.read','finance.manage','finance.settle','finance.reverse','finance.cash','pos.read','pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund','suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive','products.read','products.manage','stock.read','stock.manage','audit.read','organizations.read','organizations.manage','users.read','users.manage','roles.manage','ownership.manage']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT crm_read_dependency CHECK(NOT 'crm.read'=ANY(permissions) OR 'organizations.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT crm_write_dependency CHECK(NOT(permissions && ARRAY['crm.manage','crm.credit','crm.loyalty','orders.read']::text[]) OR 'crm.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT orders_dependency CHECK((NOT 'orders.read'=ANY(permissions) OR 'products.read'=ANY(permissions)) AND (NOT(permissions && ARRAY['orders.manage','deliveries.manage']::text[]) OR 'orders.read'=ANY(permissions)));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;UPDATE access.roles SET permissions=permissions||ARRAY['crm.read','crm.manage','crm.credit','crm.loyalty','orders.read','orders.manage','deliveries.manage']::text[] WHERE system AND name='Administrador';ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE crm.customers(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,code text NOT NULL DEFAULT('CL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),document text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',email text NOT NULL DEFAULT '',address jsonb NOT NULL,notes text NOT NULL DEFAULT '',active boolean NOT NULL,loyalty_opt_in boolean NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,unit_id,code),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE UNIQUE INDEX customer_document ON crm.customers(tenant_id,unit_id,document) WHERE document<>'';
CREATE TABLE crm.credit_profiles(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,customer_id uuid NOT NULL,credit_limit numeric(15,2) NOT NULL CHECK(credit_limit>=0),enabled boolean NOT NULL,version integer NOT NULL DEFAULT 1,reason text NOT NULL,approved_by text NOT NULL,approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,customer_id),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,unit_id,customer_id) REFERENCES crm.customers(tenant_id,unit_id,id)
);
CREATE TABLE crm.loyalty_programs(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,cents_per_point integer NOT NULL CHECK(cents_per_point BETWEEN 1 AND 1000000000),active boolean NOT NULL,version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,unit_id),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE TABLE crm.orders(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,customer_id uuid NOT NULL,number text NOT NULL DEFAULT('PV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','reserving','reserved','ready','fulfilling','fulfilled','cancelling','cancelled','returning','returned')),
 mode text NOT NULL CHECK(mode IN('pickup','delivery')),channel text NOT NULL CHECK(channel IN('counter','seller','mobile')),payment text NOT NULL CHECK(payment IN('paid','credit')),
 customer_snapshot jsonb NOT NULL,address jsonb NOT NULL,items jsonb NOT NULL CHECK(jsonb_array_length(items) BETWEEN 1 AND 50),gross numeric(15,2) NOT NULL,delivery_fee numeric(15,2) NOT NULL CHECK(delivery_fee>=0),total numeric(15,2) NOT NULL CHECK(total>0),
 due_date date NOT NULL,installments integer NOT NULL CHECK(installments BETWEEN 1 AND 36),interval_days integer NOT NULL CHECK(interval_days BETWEEN 0 AND 365),finance_key uuid NOT NULL DEFAULT gen_random_uuid(),version integer NOT NULL DEFAULT 1,
 notes text NOT NULL,reason text NOT NULL DEFAULT '',actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),fulfilled_at timestamptz,returned_at timestamptz,last_action jsonb,request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id,customer_id) REFERENCES crm.customers(tenant_id,unit_id,id),CHECK(total=gross+delivery_fee)
);
CREATE TABLE crm.loyalty_events(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,customer_id uuid NOT NULL,order_id uuid,kind text NOT NULL CHECK(kind IN('earn','reversal','adjust','redeem')),points bigint NOT NULL CHECK(points<>0),reason text NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id,customer_id) REFERENCES crm.customers(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,order_id) REFERENCES crm.orders(tenant_id,id)
);
CREATE UNIQUE INDEX loyalty_order_event ON crm.loyalty_events(tenant_id,order_id,kind) WHERE order_id IS NOT NULL;
CREATE TABLE crm.deliveries(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,order_id uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','assigned','out','delivered','failed','cancelled')),courier text NOT NULL DEFAULT '',recipient text NOT NULL DEFAULT '',scheduled_on date,history jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1,last_action jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,order_id),FOREIGN KEY(tenant_id,unit_id,order_id) REFERENCES crm.orders(tenant_id,unit_id,id)
);
ALTER TABLE finance.titles ADD COLUMN customer_id uuid;ALTER TABLE finance.titles ADD COLUMN customer_order_id uuid;
ALTER TABLE finance.titles ADD CONSTRAINT title_customer FOREIGN KEY(tenant_id,unit_id,customer_id) REFERENCES crm.customers(tenant_id,unit_id,id);
ALTER TABLE finance.titles ADD CONSTRAINT title_customer_order FOREIGN KEY(tenant_id,unit_id,customer_order_id) REFERENCES crm.orders(tenant_id,unit_id,id);
ALTER TABLE finance.titles ADD CONSTRAINT title_customer_pair CHECK((customer_id IS NULL)=(customer_order_id IS NULL));
ALTER TABLE pos.sales ADD COLUMN customer_id uuid;ALTER TABLE pos.sales ADD COLUMN customer_snapshot jsonb;
ALTER TABLE pos.sales ADD CONSTRAINT sale_customer FOREIGN KEY(tenant_id,unit_id,customer_id) REFERENCES crm.customers(tenant_id,unit_id,id);
ALTER TABLE inventory.movements ADD COLUMN customer_order_id uuid;ALTER TABLE inventory.movements ADD COLUMN customer_line_id uuid;ALTER TABLE inventory.movements ADD COLUMN customer_role text;
ALTER TABLE inventory.movements ADD CONSTRAINT stock_customer_order FOREIGN KEY(tenant_id,unit_id,customer_order_id) REFERENCES crm.orders(tenant_id,unit_id,id);
ALTER TABLE inventory.movements ADD CONSTRAINT stock_customer_pair CHECK((customer_order_id IS NULL AND customer_line_id IS NULL AND customer_role IS NULL) OR(customer_order_id IS NOT NULL AND customer_line_id IS NOT NULL AND customer_role IS NOT NULL AND customer_role IN('reserve','release','out','return')));
CREATE UNIQUE INDEX customer_movement_once ON inventory.movements(tenant_id,customer_order_id,customer_line_id,customer_role) WHERE customer_order_id IS NOT NULL;
ALTER TABLE inventory.lot_events DROP CONSTRAINT lot_events_kind_check;
ALTER TABLE inventory.lot_events ADD CONSTRAINT lot_events_kind_check CHECK(kind IN('allocate','withdraw','block','unblock','settings','sale','sale_return','loss','reversal','command','production_input','production_output','production_reverse_input','production_reverse_output','transfer_out','transfer_in','order_out','order_return'));
CREATE INDEX crm_customers_search ON crm.customers(tenant_id,unit_id,name,id);CREATE INDEX crm_order_state ON crm.orders(tenant_id,unit_id,status,created_at DESC,id DESC);CREATE INDEX crm_delivery_state ON crm.deliveries(tenant_id,unit_id,status,created_at DESC,id DESC);CREATE INDEX crm_customer_titles ON finance.titles(tenant_id,unit_id,customer_id) WHERE customer_id IS NOT NULL;
DO $$DECLARE tab text;permission text;BEGIN FOREACH tab IN ARRAY ARRAY['customers','credit_profiles','loyalty_programs','loyalty_events','orders','deliveries'] LOOP
 permission:=CASE WHEN tab IN('orders','deliveries') THEN 'orders.read' ELSE 'crm.read' END;
 EXECUTE format('ALTER TABLE crm.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE crm.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY crm_read ON crm.%I FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,%L,unit_id))',tab,permission);
 EXECUTE format('CREATE POLICY crm_internal ON crm.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
 EXECUTE format('GRANT SELECT ON crm.%I TO invictus_auth',tab);
END LOOP;END $$;
-- Perfil de crédito não expõe limite/aprovação a quem só consulta contatos.
DROP POLICY crm_read ON crm.credit_profiles;
CREATE POLICY credit_read ON crm.credit_profiles FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'crm.credit',unit_id) OR inventory.allowed(tenant_id,'finance.read',unit_id));
CREATE FUNCTION crm.exposure(customer uuid,exclude_order uuid DEFAULT NULL) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT sum(t.amount-t.paid) FROM finance.titles t WHERE t.tenant_id=identity.current_auth_tenant_id() AND t.customer_id=customer AND NOT t.cancelled),0)+coalesce((SELECT sum(o.total) FROM crm.orders o WHERE o.tenant_id=identity.current_auth_tenant_id() AND o.customer_id=customer AND o.payment='credit' AND o.status IN('reserved','ready') AND o.id IS DISTINCT FROM exclude_order),0)
$$;
CREATE FUNCTION crm.require_credit(customer uuid,branch uuid,requested_amount numeric,exclude_order uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE p crm.credit_profiles;BEGIN
 SELECT * INTO p FROM crm.credit_profiles WHERE tenant_id=identity.current_auth_tenant_id() AND customer_id=customer AND unit_id=branch;
 IF p.id IS NULL OR NOT p.enabled OR crm.exposure(customer,exclude_order)+requested_amount>p.credit_limit OR EXISTS(SELECT 1 FROM finance.titles WHERE tenant_id=p.tenant_id AND customer_id=customer AND NOT cancelled AND paid<amount AND due_date<finance.today()) THEN RAISE EXCEPTION 'Crédito bloqueado, vencido ou limite insuficiente' USING ERRCODE='P1101';END IF;
END $$;
CREATE FUNCTION crm.save_customer(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;target uuid:=nullif(input->>'id','')::uuid;old crm.customers;BEGIN
 IF NOT inventory.allowed(net,'crm.manage',branch) THEN RAISE EXCEPTION 'Cadastro não autorizado' USING ERRCODE='42501';END IF;
 IF target IS NULL THEN SELECT * INTO old FROM crm.customers WHERE tenant_id=net AND request_key=(input->>'requestKey')::uuid;IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 INSERT INTO crm.customers(tenant_id,unit_id,name,document,phone,email,address,notes,active,loyalty_opt_in,request_key,request_payload) VALUES(net,branch,input->>'name',input->>'document',input->>'phone',input->>'email',input->'address',input->>'notes',(input->>'active')::boolean,(input->>'loyaltyOptIn')::boolean,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE UPDATE crm.customers SET name=input->>'name',document=input->>'document',phone=input->>'phone',email=input->>'email',address=input->'address',notes=input->>'notes',active=(input->>'active')::boolean,loyalty_opt_in=(input->>'loyaltyOptIn')::boolean,version=version+1 WHERE tenant_id=net AND unit_id=branch AND id=target AND version=(input->>'version')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'Cliente desatualizado' USING ERRCODE='23514';END IF;END IF;RETURN target;
END $$;
CREATE FUNCTION crm.save_credit(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();c crm.customers;p crm.credit_profiles;target uuid;who text;BEGIN
 SELECT * INTO c FROM crm.customers WHERE tenant_id=net AND id=(input->>'customerId')::uuid AND active;
 IF c.id IS NULL OR NOT inventory.allowed(net,'crm.credit',c.unit_id) THEN RAISE EXCEPTION 'Crédito não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM crm.credit_profiles WHERE tenant_id=net AND customer_id=c.id;
 IF ((input->>'enabled')::boolean AND (input->>'limit')::numeric<crm.exposure(c.id)) OR (p.id IS NOT NULL AND p.version<>coalesce((input->>'version')::integer,-1)) THEN RAISE EXCEPTION 'Limite abaixo da exposição ou versão desatualizada' USING ERRCODE='P1101';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO crm.credit_profiles(tenant_id,unit_id,customer_id,credit_limit,enabled,reason,approved_by) VALUES(net,c.unit_id,c.id,(input->>'limit')::numeric,(input->>'enabled')::boolean,input->>'reason',who) ON CONFLICT(tenant_id,customer_id) DO UPDATE SET credit_limit=excluded.credit_limit,enabled=excluded.enabled,reason=excluded.reason,approved_by=who,approved_at=clock_timestamp(),version=crm.credit_profiles.version+1 RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION crm.save_program(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;p crm.loyalty_programs;target uuid;BEGIN
 IF NOT inventory.allowed(net,'crm.loyalty',branch) THEN RAISE EXCEPTION 'Programa não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM crm.loyalty_programs WHERE tenant_id=net AND unit_id=branch;
 IF p.id IS NOT NULL AND p.version<>coalesce((input->>'version')::integer,-1) THEN RAISE EXCEPTION 'Programa desatualizado' USING ERRCODE='23514';END IF;
 INSERT INTO crm.loyalty_programs(tenant_id,unit_id,cents_per_point,active) VALUES(net,branch,(input->>'centsPerPoint')::integer,(input->>'active')::boolean) ON CONFLICT(tenant_id,unit_id) DO UPDATE SET cents_per_point=excluded.cents_per_point,active=excluded.active,version=crm.loyalty_programs.version+1 RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION crm.loyalty_operation(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=identity.current_auth_tenant_id();c crm.customers;old crm.loyalty_events;balance bigint;points bigint:=(input->>'points')::bigint;target uuid;who text;BEGIN
 SELECT * INTO c FROM crm.customers WHERE tenant_id=net AND id=(input->>'customerId')::uuid AND active;
 IF c.id IS NULL OR NOT inventory.allowed(net,'crm.loyalty',c.unit_id) THEN RAISE EXCEPTION 'Pontos não autorizados' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM crm.loyalty_events WHERE tenant_id=net AND request_key=(input->>'requestKey')::uuid;IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 SELECT coalesce(sum(e.points),0) INTO balance FROM crm.loyalty_events e WHERE e.tenant_id=net AND e.customer_id=c.id;
 IF input->>'kind'='redeem' THEN points:=-points;IF NOT c.loyalty_opt_in OR NOT EXISTS(SELECT 1 FROM crm.loyalty_programs WHERE tenant_id=net AND unit_id=c.unit_id AND active) THEN RAISE EXCEPTION 'Programa não ativo ou cliente não participante' USING ERRCODE='P1101';END IF;END IF;
 IF input->>'kind' NOT IN('adjust','redeem') OR points=0 OR balance+points<0 THEN RAISE EXCEPTION 'Saldo de pontos insuficiente' USING ERRCODE='P1101';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO crm.loyalty_events(tenant_id,unit_id,customer_id,kind,points,reason,actor_name,request_key,request_payload) VALUES(net,c.unit_id,c.id,input->>'kind',points,input->>'reason',who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION crm.create_order(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;c crm.customers;old crm.orders;p inventory.products;line jsonb;result_items jsonb:='[]';gross_amount numeric:=0;line_total numeric;target uuid;who text;BEGIN
 IF NOT inventory.allowed(net,'orders.manage',branch) THEN RAISE EXCEPTION 'Pedido não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM crm.orders WHERE tenant_id=net AND request_key=(input->>'requestKey')::uuid;IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 SELECT * INTO c FROM crm.customers WHERE tenant_id=net AND unit_id=branch AND id=(input->>'customerId')::uuid AND active;
 IF c.id IS NULL OR jsonb_array_length(input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Cliente ou itens indisponíveis' USING ERRCODE='P1101';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=net AND id=(line->>'productId')::uuid AND active;
  IF p.id IS NULL OR p.sale_price<=0 OR p.sale_price<>(line->>'expectedPrice')::numeric OR (line->>'quantity')::numeric<=0 OR round((line->>'quantity')::numeric,3)<>(line->>'quantity')::numeric OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_items) x WHERE x->>'productId'=p.id::text) OR EXISTS(SELECT 1 FROM supermarket.product_profiles sp JOIN supermarket.sectors ss ON ss.tenant_id=sp.tenant_id AND ss.id=sp.sector_id WHERE sp.tenant_id=net AND sp.unit_id=branch AND sp.product_id=p.id AND NOT ss.active) THEN RAISE EXCEPTION 'Produto, setor, preço ou quantidade indisponível' USING ERRCODE='P1101';END IF;
  line_total:=round((line->>'quantity')::numeric*p.sale_price,2);IF line_total<=0 THEN RAISE EXCEPTION 'Item sem valor' USING ERRCODE='23514';END IF;gross_amount:=gross_amount+line_total;
  result_items:=result_items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'quantity',line->>'quantity','unitPrice',p.sale_price::text,'total',line_total::text,'cost','0','reserveMovementId',gen_random_uuid(),'releaseMovementId',gen_random_uuid(),'outMovementId',gen_random_uuid(),'returnMovementId',gen_random_uuid()));
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO crm.orders(tenant_id,unit_id,customer_id,mode,channel,payment,customer_snapshot,address,items,gross,delivery_fee,total,due_date,installments,interval_days,notes,actor_name,request_key,request_payload) VALUES(net,branch,c.id,input->>'mode',input->>'channel',input->>'payment',jsonb_build_object('name',c.name,'code',c.code,'phone',c.phone),input->'address',result_items,gross_amount,(input->>'deliveryFee')::numeric,gross_amount+(input->>'deliveryFee')::numeric,(input->>'dueDate')::date,(input->>'installments')::integer,(input->>'intervalDays')::integer,input->>'notes',who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION crm.transition_order(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();r crm.orders;c crm.customers;action text:=input->>'action';line jsonb;result_items jsonb:='[]';amount numeric;who text;title finance.titles;program crm.loyalty_programs;earned bigint;dummy uuid;BEGIN
 SELECT * INTO r FROM crm.orders WHERE tenant_id=net AND id=(input->>'id')::uuid FOR UPDATE;
 IF r.id IS NULL OR NOT inventory.allowed(net,'orders.manage',r.unit_id) THEN RAISE EXCEPTION 'Operação de pedido não autorizada' USING ERRCODE='42501';END IF;
 IF r.last_action=input THEN RETURN r.id;END IF;
 IF r.version<>(input->>'version')::integer THEN RAISE EXCEPTION 'Pedido desatualizado' USING ERRCODE='23514';END IF;
 SELECT * INTO c FROM crm.customers WHERE tenant_id=net AND id=r.customer_id;SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF action='reserve' AND r.status='draft' THEN
  IF NOT inventory.allowed(net,'stock.manage',r.unit_id) THEN RAISE EXCEPTION 'Reserva exige estoque' USING ERRCODE='42501';END IF;
  IF NOT c.active THEN RAISE EXCEPTION 'Cliente inativo' USING ERRCODE='P1101';END IF;
  IF r.payment='credit' THEN PERFORM crm.require_credit(c.id,r.unit_id,r.total,r.id);IF r.due_date<finance.today() THEN RAISE EXCEPTION 'Vencimento no passado' USING ERRCODE='P1101';END IF;END IF;
  UPDATE crm.orders SET status='reserving' WHERE tenant_id=net AND id=r.id;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
   IF NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=net AND id=(line->>'productId')::uuid AND active AND sale_price=(line->>'unitPrice')::numeric) OR EXISTS(SELECT 1 FROM supermarket.product_profiles sp JOIN supermarket.sectors ss ON ss.tenant_id=sp.tenant_id AND ss.id=sp.sector_id WHERE sp.tenant_id=net AND sp.unit_id=r.unit_id AND sp.product_id=(line->>'productId')::uuid AND NOT ss.active) THEN RAISE EXCEPTION 'Preço ou setor mudou' USING ERRCODE='P1101';END IF;
   INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,customer_order_id,customer_line_id,customer_role) VALUES(net,(line->>'reserveMovementId')::uuid,r.unit_id,(line->>'productId')::uuid,'reserve',(line->>'quantity')::numeric,0,false,'Reserva '||r.number,gen_random_uuid(),r.id,(line->>'id')::uuid,'reserve');
  END LOOP;
  UPDATE crm.orders SET status='reserved',version=version+1,reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='ready' AND r.status='reserved' THEN UPDATE crm.orders SET status='ready',version=version+1,reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='cancel' AND r.status IN('draft','reserved','ready') THEN
  IF r.status<>'draft' AND NOT inventory.allowed(net,'stock.manage',r.unit_id) THEN RAISE EXCEPTION 'Cancelamento de reserva exige estoque' USING ERRCODE='42501';END IF;
  UPDATE crm.orders SET status='cancelling' WHERE tenant_id=net AND id=r.id;
  IF r.status<>'draft' THEN FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,customer_order_id,customer_line_id,customer_role) VALUES(net,(line->>'releaseMovementId')::uuid,r.unit_id,(line->>'productId')::uuid,'release',(line->>'quantity')::numeric,0,false,'Cancelar reserva '||r.number,gen_random_uuid(),r.id,(line->>'id')::uuid,'release');END LOOP;END IF;
  UPDATE crm.orders SET status='cancelled',version=version+1,reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='fulfill' AND r.status='ready' THEN
  IF NOT inventory.allowed(net,'stock.manage',r.unit_id) OR NOT inventory.allowed(net,'finance.manage',r.unit_id) OR (r.payment='paid' AND NOT inventory.allowed(net,'finance.settle',r.unit_id)) THEN RAISE EXCEPTION 'Conclusão exige estoque e financeiro' USING ERRCODE='42501';END IF;
  IF NOT c.active THEN RAISE EXCEPTION 'Cliente inativo' USING ERRCODE='P1101';END IF;
  IF r.payment='credit' THEN PERFORM crm.require_credit(c.id,r.unit_id,r.total,r.id);IF r.due_date<finance.today() THEN RAISE EXCEPTION 'Vencimento no passado' USING ERRCODE='P1101';END IF;END IF;
  UPDATE crm.orders SET status='fulfilling' WHERE tenant_id=net AND id=r.id;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
   IF NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=net AND id=(line->>'productId')::uuid AND active AND sale_price=(line->>'unitPrice')::numeric) OR EXISTS(SELECT 1 FROM supermarket.product_profiles sp JOIN supermarket.sectors ss ON ss.tenant_id=sp.tenant_id AND ss.id=sp.sector_id WHERE sp.tenant_id=net AND sp.unit_id=r.unit_id AND sp.product_id=(line->>'productId')::uuid AND NOT ss.active) THEN RAISE EXCEPTION 'Preço ou setor mudou; cancele e refaça' USING ERRCODE='P1101';END IF;
   INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,customer_order_id,customer_line_id,customer_role) VALUES(net,(line->>'releaseMovementId')::uuid,r.unit_id,(line->>'productId')::uuid,'release',(line->>'quantity')::numeric,0,false,'Liberar reserva '||r.number,gen_random_uuid(),r.id,(line->>'id')::uuid,'release');
   INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,customer_order_id,customer_line_id,customer_role) VALUES(net,(line->>'outMovementId')::uuid,r.unit_id,(line->>'productId')::uuid,'out',(line->>'quantity')::numeric,0,false,'Conclusão '||r.number,gen_random_uuid(),r.id,(line->>'id')::uuid,'out');
   SELECT -value_delta INTO amount FROM inventory.movements WHERE tenant_id=net AND id=(line->>'outMovementId')::uuid;
   result_items:=result_items||jsonb_build_array(line||jsonb_build_object('cost',amount::text,'lots',coalesce((SELECT jsonb_agg(jsonb_build_object('code',b.code,'expiresOn',b.expires_on,'quantity',(-e.quantity_delta)::text)) FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE e.tenant_id=net AND e.movement_id=(line->>'outMovementId')::uuid AND e.kind='order_out'),'[]')));
  END LOOP;
  dummy:=finance.create_titles(jsonb_build_object('unitId',r.unit_id,'kind','receivable','counterparty',r.customer_snapshot->>'name','description','Pedido '||r.number,'category','Vendas manuais','reference',r.number,'notes',r.notes,'issueDate',finance.today(),'dueDate',CASE WHEN r.payment='paid' THEN finance.today() ELSE r.due_date END,'amount',r.total::text,'installments',CASE WHEN r.payment='paid' THEN 1 ELSE r.installments END,'intervalDays',r.interval_days,'requestKey',r.finance_key));
  UPDATE finance.titles SET customer_id=c.id,customer_order_id=r.id,source_snapshot=jsonb_build_object('orderNumber',r.number,'customerCode',c.code,'kind','manual_order') WHERE tenant_id=net AND request_key=r.finance_key;
  IF r.payment='paid' THEN SELECT * INTO title FROM finance.titles WHERE tenant_id=net AND request_key=r.finance_key;dummy:=finance.settle(jsonb_build_object('titleId',title.id,'version',title.version,'accountId',input->>'accountId','principal',r.total::text,'interest','0','fee','0','discount','0','postedDate',finance.today(),'method',input->>'method','reference',input->>'reference','notes',input->>'reason','requestKey',gen_random_uuid()));END IF;
  SELECT * INTO program FROM crm.loyalty_programs WHERE tenant_id=net AND unit_id=r.unit_id AND active;
  IF c.loyalty_opt_in AND program.id IS NOT NULL THEN earned:=floor(r.gross*100/program.cents_per_point);IF earned>0 THEN INSERT INTO crm.loyalty_events(tenant_id,unit_id,customer_id,order_id,kind,points,reason,actor_name,request_key,request_payload) VALUES(net,r.unit_id,c.id,r.id,'earn',earned,'Pontos do pedido '||r.number,who,gen_random_uuid(),jsonb_build_object('centsPerPoint',program.cents_per_point,'programVersion',program.version));END IF;END IF;
  IF r.mode='delivery' THEN INSERT INTO crm.deliveries(tenant_id,unit_id,order_id) VALUES(net,r.unit_id,r.id);END IF;
  UPDATE crm.orders SET status='fulfilled',items=result_items,fulfilled_at=clock_timestamp(),version=version+1,reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='return' AND r.status='fulfilled' THEN
  IF NOT inventory.allowed(net,'stock.manage',r.unit_id) OR NOT inventory.allowed(net,'finance.manage',r.unit_id) THEN RAISE EXCEPTION 'Devolução exige estoque e financeiro' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM finance.titles WHERE tenant_id=net AND customer_order_id=r.id AND paid>0) OR EXISTS(SELECT 1 FROM crm.deliveries WHERE tenant_id=net AND order_id=r.id AND status='out') THEN RAISE EXCEPTION 'Estorne recebimentos e resolva entrega em rota antes da devolução' USING ERRCODE='P1101';END IF;
  UPDATE crm.orders SET status='returning' WHERE tenant_id=net AND id=r.id;
  FOR title IN SELECT * FROM finance.titles WHERE tenant_id=net AND customer_order_id=r.id AND NOT cancelled LOOP dummy:=finance.cancel_title(jsonb_build_object('titleId',title.id,'version',title.version,'reason',input->>'reason'));END LOOP;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,customer_order_id,customer_line_id,customer_role) VALUES(net,(line->>'returnMovementId')::uuid,r.unit_id,(line->>'productId')::uuid,'entry',(line->>'quantity')::numeric,0,false,'Devolução '||r.number,gen_random_uuid(),r.id,(line->>'id')::uuid,'return');END LOOP;
  SELECT points INTO earned FROM crm.loyalty_events WHERE tenant_id=net AND order_id=r.id AND kind='earn';IF earned>0 THEN INSERT INTO crm.loyalty_events(tenant_id,unit_id,customer_id,order_id,kind,points,reason,actor_name,request_key,request_payload) VALUES(net,r.unit_id,c.id,r.id,'reversal',-earned,input->>'reason',who,gen_random_uuid(),'{}');END IF;
  UPDATE crm.deliveries SET status='cancelled',version=version+1,history=history||jsonb_build_array(jsonb_build_object('status','cancelled','actor',who,'reason',input->>'reason','at',clock_timestamp())) WHERE tenant_id=net AND order_id=r.id AND status IN('pending','assigned','failed');
  UPDATE crm.orders SET status='returned',returned_at=clock_timestamp(),version=version+1,reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSE RAISE EXCEPTION 'Operação fora de sequência' USING ERRCODE='P1101';END IF;RETURN r.id;
END $$;
CREATE FUNCTION crm.transition_delivery(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE net uuid:=identity.current_auth_tenant_id();d crm.deliveries;o crm.orders;action text:=input->>'action';who text;BEGIN
 SELECT * INTO d FROM crm.deliveries WHERE tenant_id=net AND id=(input->>'id')::uuid FOR UPDATE;
 IF d.id IS NULL OR NOT inventory.allowed(net,'deliveries.manage',d.unit_id) THEN RAISE EXCEPTION 'Entrega não autorizada' USING ERRCODE='42501';END IF;
 IF d.last_action=input THEN RETURN d.id;END IF;
 SELECT * INTO o FROM crm.orders WHERE tenant_id=net AND id=d.order_id;
 IF d.version<>(input->>'version')::integer OR o.status<>'fulfilled' OR jsonb_array_length(d.history)>=100 OR NOT ((action='assigned' AND d.status IN('pending','failed')) OR (action='out' AND d.status='assigned') OR (action IN('delivered','failed') AND d.status='out')) THEN RAISE EXCEPTION 'Entrega desatualizada ou fora de sequência' USING ERRCODE='P1101';END IF;
 IF (action='assigned' AND length(btrim(input->>'courier'))<2) OR (action='delivered' AND length(btrim(input->>'recipient'))<2) THEN RAISE EXCEPTION 'Informe entregador ou recebedor' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE crm.deliveries SET status=action,courier=CASE WHEN action='assigned' THEN input->>'courier' ELSE courier END,scheduled_on=CASE WHEN action='assigned' THEN nullif(input->>'scheduledOn','')::date ELSE scheduled_on END,recipient=CASE WHEN action='delivered' THEN input->>'recipient' ELSE recipient END,version=version+1,last_action=input,history=history||jsonb_build_array(jsonb_build_object('status',action,'actor',who,'reason',input->>'reason','at',clock_timestamp())) WHERE tenant_id=net AND id=d.id;RETURN d.id;
END $$;

CREATE FUNCTION crm.guard_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r crm.orders;line jsonb;BEGIN
 IF NEW.kind='reverse' AND EXISTS(SELECT 1 FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of AND customer_order_id IS NOT NULL) THEN RAISE EXCEPTION 'Devolva pelo pedido' USING ERRCODE='P1101';END IF;
 IF NEW.customer_order_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO r FROM crm.orders WHERE tenant_id=NEW.tenant_id AND id=NEW.customer_order_id;
 SELECT value INTO line FROM jsonb_array_elements(r.items) WHERE value->>'id'=NEW.customer_line_id::text AND value->>'productId'=NEW.product_id::text;
 IF r.id IS NULL OR line IS NULL OR NEW.unit_id<>r.unit_id OR NEW.packaged OR NEW.quantity<>(line->>'quantity')::numeric OR NEW.sale_id IS NOT NULL OR NEW.purchase_receipt_id IS NOT NULL OR NEW.production_run_id IS NOT NULL OR NEW.transfer_id IS NOT NULL OR NEW.lot_id IS NOT NULL OR NOT (
 (NEW.customer_role='reserve' AND NEW.kind='reserve' AND r.status='reserving' AND NEW.id=(line->>'reserveMovementId')::uuid) OR
 (NEW.customer_role='release' AND NEW.kind='release' AND r.status IN('fulfilling','cancelling') AND NEW.id=(line->>'releaseMovementId')::uuid) OR
 (NEW.customer_role='out' AND NEW.kind='out' AND r.status='fulfilling' AND NEW.id=(line->>'outMovementId')::uuid) OR
 (NEW.customer_role='return' AND NEW.kind='entry' AND r.status='returning' AND NEW.id=(line->>'returnMovementId')::uuid)) THEN RAISE EXCEPTION 'Origem de pedido inválida' USING ERRCODE='P1101';END IF;RETURN NEW;END $$;
CREATE TRIGGER aa_crm_origin BEFORE INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION crm.guard_movement();
CREATE FUNCTION crm.return_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE amount numeric;BEGIN
 IF NEW.customer_role IS DISTINCT FROM 'return' THEN RETURN NEW;END IF;
 SELECT (x->>'cost')::numeric INTO amount FROM crm.orders r CROSS JOIN LATERAL jsonb_array_elements(r.items) x WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.customer_order_id AND x->>'id'=NEW.customer_line_id::text;
 IF amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Custo original ausente' USING ERRCODE='P1101';END IF;
 NEW.value_after:=NEW.value_after-NEW.value_delta+amount;NEW.value_delta:=amount;NEW.cost:=round(amount/NEW.base_quantity,6);
 UPDATE inventory.levels SET value=NEW.value_after,last_cost=NEW.previous_last_cost WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;RETURN NEW;END $$;
CREATE TRIGGER crm_return_cost BEFORE INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION crm.return_cost();
CREATE FUNCTION crm.guard_reserves() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE held numeric;BEGIN
 SELECT coalesce(sum((x->>'quantity')::numeric),0) INTO held FROM crm.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) x WHERE o.tenant_id=NEW.tenant_id AND o.unit_id=NEW.unit_id AND o.status IN('reserved','ready') AND x->>'productId'=NEW.product_id::text;
 IF NEW.reserved_after<held OR (NEW.customer_role='out' AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after) THEN RAISE EXCEPTION 'Saldo comprometido em pedidos' USING ERRCODE='P1101';END IF;RETURN NEW;END $$;
CREATE TRIGGER zzz_crm_reservations AFTER INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION crm.guard_reserves();
CREATE FUNCTION crm.restore_lots() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE e inventory.lot_events;BEGIN
 IF NEW.customer_role IS DISTINCT FROM 'return' THEN RETURN NEW;END IF;
 FOR e IN SELECT e.* FROM inventory.lot_events e JOIN inventory.movements m ON m.tenant_id=e.tenant_id AND m.id=e.movement_id WHERE m.tenant_id=NEW.tenant_id AND m.customer_order_id=NEW.customer_order_id AND m.customer_line_id=NEW.customer_line_id AND e.kind='order_out' LOOP
 UPDATE inventory.lots SET quantity=quantity-e.quantity_delta,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=e.lot_id;
 INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,e.lot_id,'order_return',-e.quantity_delta,NEW.id,NEW.reason,NEW.actor_name);END LOOP;RETURN NEW;END $$;
CREATE TRIGGER zz_crm_return_lots AFTER INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION crm.restore_lots();
CREATE FUNCTION crm.guard_title() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r crm.orders;BEGIN
 IF NEW.customer_order_id IS NULL AND OLD.customer_order_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO r FROM crm.orders WHERE tenant_id=NEW.tenant_id AND id=coalesce(OLD.customer_order_id,NEW.customer_order_id);
 IF OLD.customer_order_id IS NULL THEN
 IF r.status<>'fulfilling' OR r.finance_key<>NEW.request_key OR r.customer_id<>NEW.customer_id OR r.unit_id<>NEW.unit_id OR NEW.kind<>'receivable' THEN RAISE EXCEPTION 'Vínculo de título inválido' USING ERRCODE='P1101';END IF;
 ELSIF NEW.customer_order_id IS DISTINCT FROM OLD.customer_order_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR (NEW.cancelled AND NOT OLD.cancelled AND r.status<>'returning') THEN RAISE EXCEPTION 'Cancele o recebível pela devolução do pedido' USING ERRCODE='P1101';END IF;RETURN NEW;END $$;
CREATE TRIGGER crm_title_guard BEFORE UPDATE ON finance.titles FOR EACH ROW EXECUTE FUNCTION crm.guard_title();
CREATE FUNCTION crm.credit_view(customer uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c crm.customers;result jsonb;BEGIN
 SELECT * INTO c FROM crm.customers WHERE tenant_id=identity.current_auth_tenant_id() AND id=customer;
 IF c.id IS NULL OR NOT (inventory.allowed(c.tenant_id,'crm.credit',c.unit_id) OR inventory.allowed(c.tenant_id,'finance.read',c.unit_id)) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('id',p.id,'limit',p.credit_limit::text,'enabled',p.enabled,'reason',p.reason,'version',p.version,'approvedBy',p.approved_by,'exposure',crm.exposure(customer)::text,'overdue',coalesce((SELECT sum(t.amount-t.paid) FROM finance.titles t WHERE t.tenant_id=c.tenant_id AND t.customer_id=customer AND NOT t.cancelled AND t.due_date<finance.today()),0)::text,'held',coalesce((SELECT sum(o.total) FROM crm.orders o WHERE o.tenant_id=c.tenant_id AND o.customer_id=customer AND o.payment='credit' AND o.status IN('reserved','ready')),0)::text,'available',greatest(0,p.credit_limit-crm.exposure(customer))::text) INTO result FROM crm.credit_profiles p WHERE p.tenant_id=c.tenant_id AND p.customer_id=customer;RETURN result;END $$;
ALTER TABLE audit.events DROP CONSTRAINT events_category_check;ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases','sales','cash','finance','fiscal','customers'));
CREATE FUNCTION crm.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE a jsonb:=to_jsonb(NEW);b jsonb;changed jsonb;who text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 a:=a-ARRAY['tenant_id','request_key','request_payload','last_action'];b:=b-ARRAY['tenant_id','request_key','request_payload','last_action'];
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') INTO changed FROM jsonb_object_keys(a) k WHERE a->k IS DISTINCT FROM b->k;
 a:=a-ARRAY['document','phone','email','address','notes','customer_snapshot','recipient','courier','history'];b:=b-ARRAY['document','phone','email','address','notes','customer_snapshot','recipient','courier','history'];
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),'Relacionamento comercial','customers','customer_'||TG_TABLE_NAME,NEW.id,'customer_'||TG_TABLE_NAME||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,CASE WHEN b IS NULL THEN NULL ELSE b||jsonb_build_object('changedFields',changed) END,a||jsonb_build_object('changedFields',changed),nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;END $$;
DO $$DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['customers','credit_profiles','loyalty_programs','loyalty_events','orders','deliveries'] LOOP EXECUTE format('CREATE TRIGGER audit_capture_crm_%I AFTER INSERT OR UPDATE ON crm.%I FOR EACH ROW EXECUTE FUNCTION crm.capture_audit()',tab,tab);END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.save_customer(jsonb),crm.save_credit(jsonb),crm.save_program(jsonb),crm.loyalty_operation(jsonb),crm.create_order(jsonb),crm.transition_order(jsonb),crm.transition_delivery(jsonb),crm.credit_view(uuid) TO invictus_auth;

CREATE OR REPLACE FUNCTION inventory.lot_bridge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b inventory.lots;e inventory.lot_events;original inventory.movements;remaining numeric;taken numeric;event_name text;sum_lots numeric;
BEGIN
 PERFORM 1 FROM inventory.lot_controls WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
 IF NOT FOUND THEN IF NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'Lote sem controle' USING ERRCODE='P0801';END IF;RETURN NEW;END IF;
 IF NEW.reserved_delta>0 AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN RAISE EXCEPTION 'Saldo de lotes válidos insuficiente para reserva' USING ERRCODE='P0801';END IF;
 IF NEW.physical_delta<0 THEN
  remaining:=-NEW.physical_delta;
  IF (NEW.sale_id IS NOT NULL OR NEW.production_role='input' OR NEW.transfer_role='out' OR NEW.customer_role='out') AND NEW.kind='out' THEN
   FOR b IN SELECT * FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id AND quantity>0 AND NOT blocked AND expires_on>=inventory.lot_today() ORDER BY expires_on,created_at,id FOR UPDATE LOOP
    taken:=least(remaining,b.quantity);UPDATE inventory.lots SET quantity=quantity-taken,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
    INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,CASE WHEN NEW.customer_role='out' THEN 'order_out' WHEN NEW.transfer_role='out' THEN 'transfer_out' WHEN NEW.production_role='input' THEN 'production_input' ELSE 'sale' END,-taken,NEW.id,NEW.reason,NEW.actor_name);
    remaining:=remaining-taken;EXIT WHEN remaining=0;
   END LOOP;
   IF remaining>0 THEN RAISE EXCEPTION 'Venda exige saldo classificado em lotes válidos e não bloqueados' USING ERRCODE='P0801';END IF;
  ELSIF NEW.production_role='reverse_output' THEN
   SELECT * INTO e FROM inventory.lot_events WHERE tenant_id=NEW.tenant_id AND movement_id=NEW.reversal_of AND kind='production_output';
   SELECT * INTO b FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND id=e.lot_id FOR UPDATE;
   IF e.id IS NULL OR b.quantity<remaining OR e.quantity_delta<>remaining THEN RAISE EXCEPTION 'Lote produzido foi alterado; regularize antes de estornar' USING ERRCODE='P0901';END IF;
   UPDATE inventory.lots SET quantity=quantity-remaining,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
   INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,'production_reverse_output',-remaining,NEW.id,NEW.reason,NEW.actor_name);
  ELSIF NEW.kind='loss' AND NEW.lot_id IS NOT NULL THEN
   SELECT * INTO b FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND id=NEW.lot_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
   IF b.id IS NULL OR b.quantity<remaining THEN RAISE EXCEPTION 'Lote ou quantidade indisponível' USING ERRCODE='P0801';END IF;
   UPDATE inventory.lots SET quantity=quantity-remaining,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
   INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name,loss_kind) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,'loss',-remaining,NEW.id,NEW.reason,NEW.actor_name,nullif(current_setting('app.lot_loss_kind',true),''));
  ELSE
   -- Saídas/estornos genéricos só podem consumir a parcela ainda não classificada.
   SELECT coalesce(sum(quantity),0) INTO sum_lots FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
   IF NEW.physical_after<sum_lots THEN RAISE EXCEPTION 'Use o descarte por lote ou retire a classificação antes de estornar a entrada' USING ERRCODE='P0801';END IF;
  END IF;
 ELSIF NEW.physical_delta>0 AND (NEW.sale_id IS NOT NULL OR NEW.kind='reverse') THEN
  IF NEW.sale_id IS NOT NULL THEN
   SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND sale_id=NEW.sale_id AND sale_line_id=NEW.sale_line_id AND kind='out';event_name:='sale_return';
  ELSE SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of;event_name:=CASE WHEN NEW.production_role='reverse_input' THEN 'production_reverse_input' ELSE 'reversal' END;END IF;
  FOR e IN SELECT * FROM inventory.lot_events WHERE tenant_id=NEW.tenant_id AND movement_id=original.id AND kind IN('sale','loss','production_input') LOOP
   UPDATE inventory.lots SET quantity=quantity-e.quantity_delta,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=e.lot_id;
   INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,e.lot_id,event_name,-e.quantity_delta,NEW.id,NEW.reason,NEW.actor_name);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

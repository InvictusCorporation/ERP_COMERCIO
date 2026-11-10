CREATE SCHEMA pos;
REVOKE ALL ON SCHEMA pos FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read','products.read','products.manage','stock.read','stock.manage','suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive','pos.read','pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT pos_read_products CHECK(NOT 'pos.read'=ANY(permissions) OR 'products.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT pos_write_read CHECK(NOT(permissions && ARRAY['pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund']::text[]) OR 'pos.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT pos_dependencies CHECK((NOT 'pos.sell'=ANY(permissions) OR 'pos.cash'=ANY(permissions)) AND (NOT 'pos.cash.manage'=ANY(permissions) OR 'pos.cash'=ANY(permissions)) AND (NOT 'pos.discount'=ANY(permissions) OR 'pos.sell'=ANY(permissions)) AND (NOT 'pos.refund'=ANY(permissions) OR 'pos.cash'=ANY(permissions)));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=permissions||ARRAY['pos.read','pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund']::text[] WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE pos.registers(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,23}$'),
 operator_id uuid NOT NULL REFERENCES identity.users(id),operator_name text NOT NULL,opening_amount numeric(15,2) NOT NULL CHECK(opening_amount>=0),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),closed_at timestamptz,closed_by text,counted numeric(15,2),expected numeric(15,2),difference numeric(15,2),notes text NOT NULL DEFAULT '',
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,close_key uuid,
 sandbox boolean NOT NULL DEFAULT true CHECK(sandbox),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,close_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),CHECK(counted IS NULL OR counted>=0)
);
CREATE UNIQUE INDEX pos_open_code ON pos.registers(tenant_id,unit_id,code) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX pos_open_operator ON pos.registers(tenant_id,unit_id,operator_id) WHERE closed_at IS NULL;
CREATE TABLE pos.sales(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,register_id uuid NOT NULL,
 number text NOT NULL DEFAULT ('VD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 operator_id uuid NOT NULL REFERENCES identity.users(id),operator_name text NOT NULL,unit_snapshot jsonb NOT NULL,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 gross numeric(15,2) NOT NULL CHECK(gross>0),discount numeric(15,2) NOT NULL CHECK(discount>=0),total numeric(15,2) NOT NULL CHECK(total>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending','confirmed','cancelled','returned')),
 version integer NOT NULL DEFAULT 1,current_payment_id uuid,notes text NOT NULL DEFAULT '',reason text,
 confirmed_at timestamptz,returned_at timestamptz,returned_by text,refund_register_id uuid,refund_key uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,sandbox boolean NOT NULL DEFAULT true CHECK(sandbox),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,refund_key),
 FOREIGN KEY(tenant_id,unit_id,register_id) REFERENCES pos.registers(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,unit_id,refund_register_id) REFERENCES pos.registers(tenant_id,unit_id,id),CHECK(total=gross-discount)
);
CREATE INDEX pos_sales_unit_time ON pos.sales(tenant_id,unit_id,created_at DESC,id DESC);
CREATE TABLE pos.payments(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),sale_id uuid NOT NULL,unit_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','authorized','confirmed','declined','cancelled','refunded')),
 methods jsonb NOT NULL,cash_amount numeric(15,2) NOT NULL CHECK(cash_amount>=0),change_amount numeric(15,2) NOT NULL CHECK(change_amount>=0),total numeric(15,2) NOT NULL CHECK(total>0),
 provider text NOT NULL DEFAULT 'local_sandbox' CHECK(provider='local_sandbox'),request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,sale_id) REFERENCES pos.sales(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
ALTER TABLE pos.sales ADD CONSTRAINT pos_current_payment FOREIGN KEY(tenant_id,current_payment_id) REFERENCES pos.payments(tenant_id,id);
CREATE TABLE pos.cash_entries(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,register_id uuid NOT NULL,sale_id uuid,
 kind text NOT NULL CHECK(kind IN('opening','sale','refund','supply','withdraw')),amount numeric(15,2) NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300),actor_id uuid NOT NULL REFERENCES identity.users(id),actor_name text NOT NULL,
 request_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,sale_id,kind),FOREIGN KEY(tenant_id,unit_id,register_id) REFERENCES pos.registers(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,sale_id) REFERENCES pos.sales(tenant_id,id),
 CHECK((kind IN('sale','refund'))=(sale_id IS NOT NULL)),CHECK((kind IN('opening','sale','supply') AND amount>=0) OR (kind IN('refund','withdraw') AND amount<0))
);
CREATE INDEX cash_entries_register_time ON pos.cash_entries(tenant_id,register_id,created_at DESC,id DESC);
ALTER TABLE inventory.movements ADD COLUMN sale_id uuid;
ALTER TABLE inventory.movements ADD COLUMN sale_line_id uuid;
ALTER TABLE inventory.movements ADD CONSTRAINT stock_sale_source FOREIGN KEY(tenant_id,sale_id) REFERENCES pos.sales(tenant_id,id);
ALTER TABLE inventory.movements ADD CONSTRAINT stock_sale_pair CHECK((sale_id IS NULL)=(sale_line_id IS NULL));
CREATE UNIQUE INDEX stock_sale_once ON inventory.movements(tenant_id,sale_id,sale_line_id,kind) WHERE sale_id IS NOT NULL;
CREATE FUNCTION pos.permitted(network uuid,permission text,branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(current_setting('app.pos_sandbox',true),'')='true' AND inventory.allowed(network,permission,branch)
$$;
CREATE FUNCTION pos.cash_balance(network uuid,target uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(amount),0) FROM pos.cash_entries WHERE tenant_id=network AND register_id=target AND inventory.allowed(network,'pos.read',unit_id)
$$;
CREATE FUNCTION pos.own_register(network uuid,target uuid,permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM pos.registers r WHERE r.tenant_id=network AND r.id=target AND r.closed_at IS NULL AND pos.permitted(network,permission,r.unit_id) AND (r.operator_id=identity.current_auth_actor_id() OR pos.permitted(network,'pos.cash.manage',r.unit_id)))
$$;
GRANT USAGE ON SCHEMA pos TO invictus_auth;
GRANT SELECT ON pos.registers,pos.sales,pos.payments,pos.cash_entries TO invictus_auth;
ALTER TABLE pos.registers ENABLE ROW LEVEL SECURITY;ALTER TABLE pos.registers FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.sales ENABLE ROW LEVEL SECURITY;ALTER TABLE pos.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.payments ENABLE ROW LEVEL SECURITY;ALTER TABLE pos.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.cash_entries ENABLE ROW LEVEL SECURITY;ALTER TABLE pos.cash_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY registers_read ON pos.registers FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'pos.read',unit_id));
CREATE POLICY sales_read ON pos.sales FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'pos.read',unit_id));
CREATE POLICY payments_read ON pos.payments FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'pos.read',unit_id));
CREATE POLICY cash_read ON pos.cash_entries FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'pos.read',unit_id));
CREATE POLICY registers_internal ON pos.registers TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY sales_internal ON pos.sales TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY payments_internal ON pos.payments TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY cash_internal ON pos.cash_entries TO invictus_migrator USING(true) WITH CHECK(true);
CREATE FUNCTION pos.open_register(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;r pos.registers;target uuid;who text;
BEGIN
 IF NOT pos.permitted(network,'pos.cash',branch) THEN RAISE EXCEPTION 'Caixa não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF r.id IS NOT NULL THEN IF r.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN r.id;END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO pos.registers(tenant_id,unit_id,code,operator_id,operator_name,opening_amount,request_key,request_payload) VALUES(network,branch,input->>'code',identity.current_auth_actor_id(),who,(input->>'openingAmount')::numeric,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 INSERT INTO pos.cash_entries(tenant_id,unit_id,register_id,kind,amount,reason,actor_id,actor_name,request_key) VALUES(network,branch,target,'opening',(input->>'openingAmount')::numeric,'Abertura de caixa de teste',identity.current_auth_actor_id(),who,gen_random_uuid());RETURN target;
END $$;
CREATE FUNCTION pos.adjust_cash(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();target uuid:=(input->>'registerId')::uuid;r pos.registers;previous pos.cash_entries;amount numeric:=(input->>'amount')::numeric;who text;entry_id uuid;
BEGIN
 IF NOT pos.own_register(network,target,'pos.cash.manage') THEN RAISE EXCEPTION 'Caixa não autorizado' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND id=target FOR UPDATE;
 SELECT * INTO previous FROM pos.cash_entries WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF previous.id IS NOT NULL THEN IF previous.register_id<>target OR previous.kind<>input->>'kind' OR abs(previous.amount)<>amount OR previous.reason<>input->>'reason' THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN previous.id;END IF;
 IF input->>'kind' NOT IN('supply','withdraw') OR amount<=0 OR length(btrim(input->>'reason')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Movimento inválido' USING ERRCODE='23514';END IF;
 IF input->>'kind'='withdraw' THEN amount:=-amount;END IF;
 IF pos.cash_balance(network,target)+amount<0 THEN RAISE EXCEPTION 'Saldo de caixa insuficiente' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO pos.cash_entries(tenant_id,unit_id,register_id,kind,amount,reason,actor_id,actor_name,request_key) VALUES(network,r.unit_id,target,input->>'kind',amount,input->>'reason',identity.current_auth_actor_id(),who,(input->>'requestKey')::uuid) RETURNING id INTO entry_id;RETURN entry_id;
END $$;
CREATE FUNCTION pos.close_register(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();target uuid:=(input->>'registerId')::uuid;r pos.registers;balance numeric;who text;
BEGIN
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND id=target FOR UPDATE;
 IF r.id IS NULL OR NOT pos.permitted(network,'pos.cash',r.unit_id) OR (r.operator_id<>identity.current_auth_actor_id() AND NOT pos.permitted(network,'pos.cash.manage',r.unit_id)) THEN RAISE EXCEPTION 'Caixa não autorizado' USING ERRCODE='42501';END IF;
 IF r.closed_at IS NOT NULL THEN IF r.close_key=(input->>'requestKey')::uuid AND r.counted=(input->>'counted')::numeric AND r.notes=input->>'notes' THEN RETURN target;END IF;RAISE EXCEPTION 'Caixa encerrado' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM pos.sales WHERE tenant_id=network AND register_id=target AND status='pending') THEN RAISE EXCEPTION 'Finalize ou cancele vendas pendentes' USING ERRCODE='23514';END IF;
 balance:=pos.cash_balance(network,target);SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE pos.registers SET closed_at=clock_timestamp(),closed_by=who,counted=(input->>'counted')::numeric,expected=balance,difference=(input->>'counted')::numeric-balance,notes=input->>'notes',close_key=(input->>'requestKey')::uuid WHERE tenant_id=network AND id=target;RETURN target;
END $$;

CREATE FUNCTION pos.save_sale(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();target uuid:=(input->>'id')::uuid;r pos.registers;previous pos.sales;p inventory.products;line jsonb;items jsonb:='[]';allocated jsonb:='[]';gross_amount numeric:=0;amount numeric;discount_amount numeric:=(input->>'discount')::numeric;acc numeric:=0;net_acc numeric:=0;net numeric;who text;unit_data jsonb;idx integer:=0;
BEGIN
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND id=(input->>'registerId')::uuid FOR UPDATE;
 IF r.id IS NULL OR r.closed_at IS NOT NULL OR r.operator_id<>identity.current_auth_actor_id() OR NOT pos.permitted(network,'pos.sell',r.unit_id) THEN RAISE EXCEPTION 'Operador ou caixa não autorizado' USING ERRCODE='42501';END IF;
 IF target IS NULL THEN
  SELECT * INTO previous FROM pos.sales WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
  IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN previous.id;END IF;
 ELSE
  SELECT * INTO previous FROM pos.sales WHERE tenant_id=network AND id=target FOR UPDATE;
  IF previous.id IS NULL OR previous.register_id<>r.id OR previous.operator_id<>identity.current_auth_actor_id() OR previous.status<>'draft' OR previous.version<>(input->>'version')::integer THEN RAISE EXCEPTION 'Venda desatualizada ou indisponível' USING ERRCODE='23514';END IF;
 END IF;
 IF discount_amount<0 OR (discount_amount>0 AND NOT pos.permitted(network,'pos.discount',r.unit_id)) THEN RAISE EXCEPTION 'Desconto não autorizado' USING ERRCODE='42501';END IF;
 IF jsonb_array_length(input->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Carrinho inválido' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active FOR SHARE;
  IF p.id IS NULL OR p.sale_price<=0 OR p.sale_price<>(line->>'expectedPrice')::numeric OR (line->>'quantity')::numeric<=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE x->>'productId'=p.id::text) THEN RAISE EXCEPTION 'Produto, quantidade ou preço mudou. Atualize o carrinho' USING ERRCODE='23514';END IF;
  amount:=round((line->>'quantity')::numeric*p.sale_price,2);IF amount<=0 THEN RAISE EXCEPTION 'Item sem valor' USING ERRCODE='23514';END IF;gross_amount:=gross_amount+amount;
  items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'quantity',line->>'quantity','unitPrice',p.sale_price::text,'gross',amount::text,'total',amount::text,'discount','0','stockCost','0','movementId',gen_random_uuid(),'returnMovementId',gen_random_uuid()));
 END LOOP;
 net:=gross_amount-discount_amount;IF net<=0 THEN RAISE EXCEPTION 'Total deve ser positivo' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(items) LOOP
  idx:=idx+1;acc:=acc+(line->>'gross')::numeric;amount:=CASE WHEN idx=jsonb_array_length(items) THEN net-net_acc ELSE round(net*acc/gross_amount,2)-net_acc END;net_acc:=net_acc+amount;
  allocated:=allocated||jsonb_build_array(line||jsonb_build_object('total',amount::text,'discount',((line->>'gross')::numeric-amount)::text));
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 SELECT jsonb_build_object('companyName',c.trade_name,'unitName',u.name,'unitCode',u.code,'cnpj',coalesce(u.cnpj,c.cnpj)) INTO unit_data FROM organizations.units u JOIN organizations.companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id WHERE u.tenant_id=network AND u.id=r.unit_id;
 IF target IS NULL THEN
  INSERT INTO pos.sales(tenant_id,unit_id,register_id,operator_id,operator_name,unit_snapshot,items,gross,discount,total,notes,request_key,request_payload) VALUES(network,r.unit_id,r.id,identity.current_auth_actor_id(),who,unit_data,allocated,gross_amount,discount_amount,net,input->>'notes',(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE UPDATE pos.sales SET items=allocated,gross=gross_amount,discount=discount_amount,total=net,notes=input->>'notes',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;
CREATE FUNCTION pos.begin_payment(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s pos.sales;p pos.payments;line jsonb;methods jsonb:='[]';method text;seen text[]:='{}';total numeric:=0;cash numeric:=0;change numeric:=0;amount numeric;tendered numeric;target uuid;
BEGIN
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=(input->>'saleId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.operator_id<>identity.current_auth_actor_id() OR NOT pos.own_register(network,s.register_id,'pos.sell') THEN RAISE EXCEPTION 'Venda não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM pos.payments WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF p.id IS NOT NULL THEN IF p.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN p.id;END IF;
 IF s.status<>'draft' OR s.version<>(input->>'version')::integer OR jsonb_array_length(input->'methods') NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Venda desatualizada ou pagamentos inválidos' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'methods') LOOP
  method:=line->>'method';amount:=(line->>'amount')::numeric;tendered:=(line->>'tendered')::numeric;
  IF method NOT IN('cash','pix','debit','credit') OR method=ANY(seen) OR amount<=0 OR (method='cash' AND tendered<amount) OR (method<>'cash' AND tendered<>amount) THEN RAISE EXCEPTION 'Pagamento ou troco inválido' USING ERRCODE='23514';END IF;
  seen:=array_append(seen,method);total:=total+amount;IF method='cash' THEN cash:=amount;change:=tendered-amount;END IF;
  methods:=methods||jsonb_build_array(jsonb_build_object('method',method,'amount',amount::text,'tendered',tendered::text));
 END LOOP;
 IF (SELECT count(*) FROM pos.payments WHERE tenant_id=network AND sale_id=s.id)>=100 THEN RAISE EXCEPTION 'Limite de tentativas da venda atingido' USING ERRCODE='23514';END IF;
 IF total<>s.total THEN RAISE EXCEPTION 'Soma de pagamentos difere do total' USING ERRCODE='23514';END IF;
 INSERT INTO pos.payments(tenant_id,sale_id,unit_id,methods,cash_amount,change_amount,total,request_key,request_payload) VALUES(network,s.id,s.unit_id,methods,cash,change,total,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 UPDATE pos.sales SET status='pending',current_payment_id=target,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.id;RETURN target;
END $$;
CREATE FUNCTION pos.settle_payment(target uuid,outcome text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();p pos.payments;s pos.sales;line jsonb;updated_items jsonb:='[]';cost numeric;who text;
BEGIN
 SELECT * INTO p FROM pos.payments WHERE tenant_id=network AND id=target FOR UPDATE;
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=p.sale_id FOR UPDATE;
 IF s.id IS NULL OR s.operator_id<>identity.current_auth_actor_id() OR NOT pos.permitted(network,'pos.sell',s.unit_id) THEN RAISE EXCEPTION 'Venda não autorizada' USING ERRCODE='42501';END IF;
 IF p.state=outcome AND outcome IN('confirmed','declined','authorized') THEN RETURN s.id;END IF;
 IF NOT pos.own_register(network,s.register_id,'pos.sell') OR s.status<>'pending' OR s.current_payment_id<>target OR p.state NOT IN('pending','authorized') OR outcome NOT IN('authorized','confirmed','declined') THEN RAISE EXCEPTION 'Pagamento fora de sequência' USING ERRCODE='23514';END IF;
 IF outcome='authorized' THEN UPDATE pos.payments SET state='authorized',updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;RETURN s.id;END IF;
 IF outcome='declined' THEN UPDATE pos.payments SET state='declined',updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;UPDATE pos.sales SET status='draft',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.id;RETURN s.id;END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(s.items) LOOP
  IF NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active AND sale_price=(line->>'unitPrice')::numeric) THEN RAISE EXCEPTION 'Preço ou produto mudou. Cancele e refaça o pedido' USING ERRCODE='23514';END IF;
  INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,sale_id,sale_line_id) VALUES(network,(line->>'movementId')::uuid,s.unit_id,(line->>'productId')::uuid,'out',(line->>'quantity')::numeric,false,0,'Venda de teste '||s.number,gen_random_uuid(),s.id,(line->>'id')::uuid);
  SELECT -value_delta INTO cost FROM inventory.movements WHERE tenant_id=network AND id=(line->>'movementId')::uuid;
  updated_items:=updated_items||jsonb_build_array(line||jsonb_build_object('stockCost',cost::text));
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF p.cash_amount>0 THEN INSERT INTO pos.cash_entries(tenant_id,unit_id,register_id,sale_id,kind,amount,reason,actor_id,actor_name,request_key) VALUES(network,s.unit_id,s.register_id,s.id,'sale',p.cash_amount,'Venda de teste '||s.number,identity.current_auth_actor_id(),who,gen_random_uuid());END IF;
 UPDATE pos.payments SET state='confirmed',updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 UPDATE pos.sales SET status='confirmed',items=updated_items,confirmed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.id;RETURN s.id;
END $$;
CREATE FUNCTION pos.cancel_sale(target uuid,expected integer,reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s pos.sales;
BEGIN
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=target FOR UPDATE;
 IF s.id IS NULL OR NOT pos.permitted(network,'pos.sell',s.unit_id) OR (s.operator_id<>identity.current_auth_actor_id() AND NOT pos.permitted(network,'pos.refund',s.unit_id)) THEN RAISE EXCEPTION 'Venda não autorizada' USING ERRCODE='42501';END IF;
 IF s.status='cancelled' AND s.version=expected+1 AND s.reason=reason THEN RETURN target;END IF;
 IF s.status NOT IN('draft','pending') OR s.version<>expected OR length(btrim(reason)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Venda desatualizada ou já confirmada' USING ERRCODE='23514';END IF;
 UPDATE pos.payments SET state='cancelled',updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.current_payment_id;
 UPDATE pos.sales SET status='cancelled',reason=reason,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;RETURN target;
END $$;
CREATE FUNCTION pos.return_sale(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s pos.sales;p pos.payments;r pos.registers;line jsonb;who text;
BEGIN
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=(input->>'saleId')::uuid FOR UPDATE;
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND id=(input->>'registerId')::uuid FOR UPDATE;
 IF s.id IS NULL OR r.id IS NULL OR r.unit_id<>s.unit_id OR NOT pos.permitted(network,'pos.refund',s.unit_id) OR NOT pos.own_register(network,r.id,'pos.cash') THEN RAISE EXCEPTION 'Devolução não autorizada' USING ERRCODE='42501';END IF;
 IF s.status='returned' THEN IF s.refund_key=(input->>'requestKey')::uuid AND s.reason=input->>'reason' AND s.refund_register_id=r.id THEN RETURN s.id;END IF;RAISE EXCEPTION 'Venda já devolvida' USING ERRCODE='23514';END IF;
 IF s.status<>'confirmed' OR s.version<>(input->>'version')::integer OR length(btrim(input->>'reason')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Venda desatualizada ou não confirmada' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM pos.payments WHERE tenant_id=network AND id=s.current_payment_id;
 IF pos.cash_balance(network,r.id)<p.cash_amount THEN RAISE EXCEPTION 'Dinheiro insuficiente no caixa da devolução' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE pos.sales SET status='returned',reason=input->>'reason',returned_at=clock_timestamp(),returned_by=who,refund_register_id=r.id,refund_key=(input->>'requestKey')::uuid,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.id;
 FOR line IN SELECT value FROM jsonb_array_elements(s.items) LOOP
  INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,sale_id,sale_line_id) VALUES(network,(line->>'returnMovementId')::uuid,s.unit_id,(line->>'productId')::uuid,'entry',(line->>'quantity')::numeric,false,0,left('Devolução de teste '||s.number||' · '||(input->>'reason'),300),gen_random_uuid(),s.id,(line->>'id')::uuid);
 END LOOP;
 IF p.cash_amount>0 THEN INSERT INTO pos.cash_entries(tenant_id,unit_id,register_id,sale_id,kind,amount,reason,actor_id,actor_name,request_key) VALUES(network,s.unit_id,r.id,s.id,'refund',-p.cash_amount,left('Devolução de teste '||s.number||' · '||(input->>'reason'),300),identity.current_auth_actor_id(),who,gen_random_uuid());END IF;
 UPDATE pos.payments SET state='refunded',updated_at=clock_timestamp() WHERE tenant_id=network AND id=p.id;RETURN s.id;
END $$;
REVOKE ALL ON FUNCTION pos.permitted(uuid,text,uuid),pos.cash_balance(uuid,uuid),pos.own_register(uuid,uuid,text),pos.open_register(jsonb),pos.adjust_cash(jsonb),pos.close_register(jsonb),pos.save_sale(jsonb),pos.begin_payment(jsonb),pos.settle_payment(uuid,text),pos.cancel_sale(uuid,integer,text),pos.return_sale(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.cash_balance(uuid,uuid),pos.open_register(jsonb),pos.adjust_cash(jsonb),pos.close_register(jsonb),pos.save_sale(jsonb),pos.begin_payment(jsonb),pos.settle_payment(uuid,text),pos.cancel_sale(uuid,integer,text),pos.return_sale(jsonb) TO invictus_auth;
ALTER TABLE audit.events DROP CONSTRAINT events_category_check;
ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases','sales','cash'));
CREATE FUNCTION pos.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];who text;source text;category_name text;label text;
BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 CASE TG_TABLE_NAME
 WHEN 'registers' THEN source:='register';category_name:='cash';label:='Caixa '||NEW.code;keys:=ARRAY['code','operator_name','opening_amount','closed_at','closed_by','counted','expected','difference','notes','sandbox'];
 WHEN 'cash_entries' THEN source:='cash_entry';category_name:='cash';label:='Movimento de caixa';keys:=ARRAY['kind','amount','reason','sale_id'];
 WHEN 'sales' THEN source:='sale';category_name:='sales';label:=NEW.number;keys:=ARRAY['number','operator_name','unit_snapshot','items','gross','discount','total','status','notes','reason','confirmed_at','returned_at','returned_by','sandbox'];
 ELSE source:='payment';category_name:='sales';SELECT number INTO label FROM pos.sales WHERE tenant_id=NEW.tenant_id AND id=NEW.sale_id;keys:=ARRAY['state','methods','cash_amount','change_amount','total','provider'];END CASE;
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);
 IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,category_name,source,NEW.id,source||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_register AFTER INSERT OR UPDATE ON pos.registers FOR EACH ROW EXECUTE FUNCTION pos.capture_audit();
CREATE TRIGGER audit_capture_sale AFTER INSERT OR UPDATE ON pos.sales FOR EACH ROW EXECUTE FUNCTION pos.capture_audit();
CREATE TRIGGER audit_capture_payment AFTER INSERT OR UPDATE ON pos.payments FOR EACH ROW EXECUTE FUNCTION pos.capture_audit();
CREATE TRIGGER audit_capture_cash AFTER INSERT ON pos.cash_entries FOR EACH ROW EXECUTE FUNCTION pos.capture_audit();
REVOKE ALL ON FUNCTION pos.capture_audit() FROM PUBLIC;

CREATE OR REPLACE FUNCTION inventory.confirm_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p inventory.products; s inventory.levels; original inventory.movements; latest uuid; actor text; purchase_item jsonb; receipt purchasing.receipts; sale_record pos.sales; sale_item jsonb;
BEGIN
 IF NOT inventory.allowed(NEW.tenant_id,'stock.manage',NEW.unit_id) AND NOT (NEW.sale_id IS NOT NULL AND pos.permitted(NEW.tenant_id,CASE WHEN NEW.kind='entry' THEN 'pos.refund' ELSE 'pos.sell' END,NEW.unit_id)) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501'; END IF;
 IF NEW.sale_id IS NOT NULL THEN
  SELECT * INTO sale_record FROM pos.sales WHERE tenant_id=NEW.tenant_id AND id=NEW.sale_id AND unit_id=NEW.unit_id;
  SELECT value INTO sale_item FROM jsonb_array_elements(sale_record.items) WHERE value->>'id'=NEW.sale_line_id::text AND value->>'productId'=NEW.product_id::text;
  IF sale_item IS NULL OR NEW.packaged OR NEW.quantity<>(sale_item->>'quantity')::numeric OR NOT ((NEW.kind='out' AND sale_record.status='pending' AND NEW.id=(sale_item->>'movementId')::uuid) OR (NEW.kind='entry' AND sale_record.status='returned' AND NEW.id=(sale_item->>'returnMovementId')::uuid)) THEN RAISE EXCEPTION 'Origem de venda inválida' USING ERRCODE='23514';END IF;
 END IF;
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
 IF NEW.sale_id IS NOT NULL THEN NEW.value_delta:=(sale_item->>'stockCost')::numeric;NEW.cost:=round(NEW.value_delta/NEW.base_quantity,6);s.last_cost:=NEW.previous_last_cost;END IF;
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
  IF original.sale_id IS NOT NULL THEN RAISE EXCEPTION 'Use a devolução de vendas para preservar caixa e estoque' USING ERRCODE='23514';END IF;
  NEW.quantity:=original.quantity;NEW.packaged:=original.packaged;NEW.factor:=original.factor;NEW.base_quantity:=original.base_quantity;NEW.cost:=original.cost;
  NEW.physical_delta:=-original.physical_delta;NEW.reserved_delta:=-original.reserved_delta;NEW.value_delta:=-original.value_delta;s.last_cost:=original.previous_last_cost;
 END CASE;
 NEW.physical_after:=s.physical+NEW.physical_delta;NEW.reserved_after:=s.reserved+NEW.reserved_delta;NEW.value_after:=s.value+NEW.value_delta;
 IF NEW.physical_after<0 OR NEW.reserved_after<0 OR NEW.reserved_after>NEW.physical_after OR NEW.value_after<0 THEN RAISE EXCEPTION 'Saldo físico ou disponível insuficiente' USING ERRCODE='23514'; END IF;
 NEW.actor_id:=identity.current_auth_actor_id();SELECT display_name INTO actor FROM identity.users WHERE id=NEW.actor_id;NEW.actor_name:=actor;
 UPDATE inventory.levels SET physical=NEW.physical_after,reserved=NEW.reserved_after,value=NEW.value_after,last_cost=s.last_cost WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
 RETURN NEW;
END $$;

CREATE FUNCTION pos.catalog(branch uuid,query_text text,barcode_text text,offset_page integer) RETURNS TABLE(id uuid,code text,name text,base_unit text,category text,price numeric,available numeric,barcodes text[],total_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id,p.code,p.name,p.base_unit,p.category,p.sale_price,coalesce(l.physical,0)-coalesce(l.reserved,0),p.barcodes,count(*) OVER()
 FROM inventory.products p LEFT JOIN inventory.levels l ON l.tenant_id=p.tenant_id AND l.unit_id=branch AND l.product_id=p.id
 WHERE p.tenant_id=identity.current_auth_tenant_id() AND pos.permitted(p.tenant_id,'pos.read',branch) AND p.active AND p.sale_price>0
 AND (barcode_text='' OR EXISTS(SELECT 1 FROM inventory.barcodes b WHERE b.tenant_id=p.tenant_id AND b.product_id=p.id AND b.barcode=lpad(barcode_text,14,'0')))
 AND (query_text='' OR position(lower(query_text) in lower(p.name||' '||p.code||' '||p.category||' '||array_to_string(p.barcodes,' ')))>0)
 ORDER BY p.name,p.id LIMIT 20 OFFSET greatest(0,least(offset_page,1000))*20
$$;
REVOKE ALL ON FUNCTION pos.catalog(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.catalog(uuid,text,text,integer) TO invictus_auth;

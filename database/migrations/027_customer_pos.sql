CREATE OR REPLACE FUNCTION pos.save_sale(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();target uuid:=(input->>'id')::uuid;r pos.registers;previous pos.sales;p inventory.products;line jsonb;items jsonb:='[]';allocated jsonb:='[]';gross_amount numeric:=0;amount numeric;discount_amount numeric:=(input->>'discount')::numeric;acc numeric:=0;net_acc numeric:=0;net numeric;who text;unit_data jsonb;idx integer:=0;measurement jsonb;decoded jsonb;g numeric;t numeric;client crm.customers;client_id uuid:=nullif(input->>'customerId','')::uuid;client_snapshot jsonb;
BEGIN
 SELECT * INTO r FROM pos.registers WHERE tenant_id=network AND id=(input->>'registerId')::uuid FOR UPDATE;
 IF r.id IS NULL OR r.closed_at IS NOT NULL OR r.operator_id<>identity.current_auth_actor_id() OR NOT pos.permitted(network,'pos.sell',r.unit_id) THEN RAISE EXCEPTION 'Operador ou caixa não autorizado' USING ERRCODE='42501';END IF;
 IF client_id IS NOT NULL THEN
 SELECT * INTO client FROM crm.customers WHERE tenant_id=network AND unit_id=r.unit_id AND id=client_id AND active;
 IF client.id IS NULL OR NOT inventory.allowed(network,'crm.read',r.unit_id) THEN RAISE EXCEPTION 'Cliente não autorizado' USING ERRCODE='42501';END IF;
 client_snapshot:=jsonb_build_object('name',client.name,'code',client.code);
 END IF;
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
  measurement:=supermarket.validate_measurement(r.unit_id,p.id,p.base_unit,(line->>'quantity')::numeric,line->'measurement');
  amount:=round((line->>'quantity')::numeric*p.sale_price,2);IF amount<=0 THEN RAISE EXCEPTION 'Item sem valor' USING ERRCODE='23514';END IF;gross_amount:=gross_amount+amount;
  items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'quantity',line->>'quantity','unitPrice',p.sale_price::text,'gross',amount::text,'total',amount::text,'discount','0','stockCost','0','measurement',measurement,'movementId',gen_random_uuid(),'returnMovementId',gen_random_uuid()));
 END LOOP;
 net:=gross_amount-discount_amount;IF net<=0 THEN RAISE EXCEPTION 'Total deve ser positivo' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(items) LOOP
  idx:=idx+1;acc:=acc+(line->>'gross')::numeric;amount:=CASE WHEN idx=jsonb_array_length(items) THEN net-net_acc ELSE round(net*acc/gross_amount,2)-net_acc END;net_acc:=net_acc+amount;
  allocated:=allocated||jsonb_build_array(line||jsonb_build_object('total',amount::text,'discount',((line->>'gross')::numeric-amount)::text));
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 SELECT jsonb_build_object('companyName',c.trade_name,'unitName',u.name,'unitCode',u.code,'cnpj',coalesce(u.cnpj,c.cnpj)) INTO unit_data FROM organizations.units u JOIN organizations.companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id WHERE u.tenant_id=network AND u.id=r.unit_id;
 IF target IS NULL THEN
  INSERT INTO pos.sales(tenant_id,unit_id,register_id,operator_id,operator_name,unit_snapshot,items,gross,discount,total,notes,customer_id,customer_snapshot,request_key,request_payload) VALUES(network,r.unit_id,r.id,identity.current_auth_actor_id(),who,unit_data,allocated,gross_amount,discount_amount,net,input->>'notes',client_id,client_snapshot,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE UPDATE pos.sales SET customer_id=client_id,customer_snapshot=client_snapshot,items=allocated,gross=gross_amount,discount=discount_amount,total=net,notes=input->>'notes',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;


CREATE FUNCTION crm.guard_sale_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.customer_snapshot IS DISTINCT FROM OLD.customer_snapshot) THEN RAISE EXCEPTION 'Cliente da venda já congelado' USING ERRCODE='P1101';END IF;
 IF NEW.customer_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.status IN('draft','pending','confirmed')) AND (NOT inventory.allowed(NEW.tenant_id,'crm.read',NEW.unit_id) OR NOT EXISTS(SELECT 1 FROM crm.customers WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND id=NEW.customer_id AND active)) THEN RAISE EXCEPTION 'Cliente inativo ou acesso revogado' USING ERRCODE='42501';END IF;RETURN NEW;END $$;
CREATE TRIGGER crm_sale_customer BEFORE INSERT OR UPDATE ON pos.sales FOR EACH ROW EXECUTE FUNCTION crm.guard_sale_customer();
REVOKE ALL ON FUNCTION crm.guard_sale_customer() FROM PUBLIC;

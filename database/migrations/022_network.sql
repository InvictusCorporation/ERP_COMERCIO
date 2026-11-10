-- Etapa 10.1: transferências operacionais e compras centralizadas da mesma empresa legal.
CREATE SCHEMA network;REVOKE ALL ON SCHEMA network FROM PUBLIC;GRANT USAGE ON SCHEMA network TO invictus_auth;
CREATE TABLE network.transfers(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),number text NOT NULL DEFAULT ('TR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 source_id uuid NOT NULL,destination_id uuid NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','dispatching','in_transit','receiving','received','cancelled')),
 version integer NOT NULL DEFAULT 1,items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
 unit_snapshot jsonb NOT NULL,total_cost numeric(24,6) NOT NULL DEFAULT 0 CHECK(total_cost>=0),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300),document_ref text,notes text NOT NULL,
 actor_name text NOT NULL,approved_by text,approved_at timestamptz,dispatched_by text,dispatched_at timestamptz,received_by text,received_at timestamptz,cancelled_by text,cancelled_at timestamptz,cancel_reason text,
 last_action jsonb,request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,source_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,destination_id) REFERENCES organizations.units(tenant_id,id),CHECK(source_id<>destination_id)
);
CREATE TABLE network.central_orders(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,order_id uuid NOT NULL,
 allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array' AND jsonb_array_length(allocations) BETWEEN 1 AND 100),
 distributed boolean NOT NULL DEFAULT false,distributed_at timestamptz,distributed_by text,request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,order_id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,order_id) REFERENCES purchasing.orders(tenant_id,id)
);
ALTER TABLE network.transfers ADD COLUMN central_id uuid;ALTER TABLE network.transfers ADD CONSTRAINT transfer_central FOREIGN KEY(tenant_id,central_id) REFERENCES network.central_orders(tenant_id,id);
ALTER TABLE inventory.movements ADD COLUMN transfer_id uuid;ALTER TABLE inventory.movements ADD COLUMN transfer_line_id uuid;ALTER TABLE inventory.movements ADD COLUMN transfer_role text;
ALTER TABLE inventory.movements ADD CONSTRAINT transfer_movement_origin FOREIGN KEY(tenant_id,transfer_id) REFERENCES network.transfers(tenant_id,id);
ALTER TABLE inventory.movements ADD CONSTRAINT transfer_movement_pair CHECK((transfer_id IS NULL AND transfer_line_id IS NULL AND transfer_role IS NULL) OR (transfer_id IS NOT NULL AND transfer_line_id IS NOT NULL AND transfer_role IN('out','in')));
CREATE UNIQUE INDEX transfer_movement_once ON inventory.movements(tenant_id,transfer_id,transfer_line_id,transfer_role) WHERE transfer_id IS NOT NULL;
ALTER TABLE inventory.lot_events DROP CONSTRAINT lot_events_kind_check;
ALTER TABLE inventory.lot_events ADD CONSTRAINT lot_events_kind_check CHECK(kind IN('allocate','withdraw','block','unblock','settings','sale','sale_return','loss','reversal','command','production_input','production_output','production_reverse_input','production_reverse_output','transfer_out','transfer_in'));
ALTER TABLE network.transfers ENABLE ROW LEVEL SECURITY;ALTER TABLE network.transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE network.central_orders ENABLE ROW LEVEL SECURITY;ALTER TABLE network.central_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY transfer_read ON network.transfers FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'stock.read',source_id) OR inventory.allowed(tenant_id,'stock.read',destination_id));
CREATE POLICY transfer_internal ON network.transfers TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY central_read ON network.central_orders FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'purchases.read',unit_id) AND inventory.allowed(tenant_id,'stock.read',unit_id));
CREATE POLICY central_internal ON network.central_orders TO invictus_migrator USING(true) WITH CHECK(true);
GRANT SELECT ON network.transfers,network.central_orders TO invictus_auth;
CREATE INDEX transfers_source_time ON network.transfers(tenant_id,source_id,created_at DESC,id DESC);CREATE INDEX transfers_destination_time ON network.transfers(tenant_id,destination_id,created_at DESC,id DESC);CREATE INDEX central_time ON network.central_orders(tenant_id,unit_id,created_at DESC,id DESC);
CREATE FUNCTION network.same_company(network_id uuid,source uuid,destination uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT source<>destination AND EXISTS(SELECT 1 FROM organizations.units a JOIN organizations.units b ON b.tenant_id=a.tenant_id AND b.company_id=a.company_id WHERE a.tenant_id=network_id AND a.id=source AND b.id=destination AND organizations.unit_available(a.id) AND organizations.unit_available(b.id))
$$;
CREATE FUNCTION network.create_transfer(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();source uuid:=(input->>'sourceId')::uuid;destination uuid:=(input->>'destinationId')::uuid;previous network.transfers;p inventory.products;line jsonb;items jsonb:='[]';target uuid;who text;snapshot jsonb;BEGIN
 IF NOT inventory.allowed(net,'stock.manage',source) OR NOT inventory.allowed(net,'stock.manage',destination) THEN RAISE EXCEPTION 'Criação exige acesso às duas unidades' USING ERRCODE='42501';END IF;
 SELECT * INTO previous FROM network.transfers WHERE tenant_id=net AND request_key=(input->>'requestKey')::uuid;
 IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN previous.id;END IF;
 IF NOT network.same_company(net,source,destination) OR jsonb_array_length(input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Origem e destino devem ser distintos da mesma empresa ativa' USING ERRCODE='P1001';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=net AND id=(line->>'productId')::uuid AND active;
  IF p.id IS NULL OR (line->>'quantity')::numeric<=0 OR round((line->>'quantity')::numeric,3)<>(line->>'quantity')::numeric OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE x->>'productId'=p.id::text) THEN RAISE EXCEPTION 'Produto ou quantidade inválido' USING ERRCODE='23514';END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'quantity',line->>'quantity','cost','0','lots','[]'::jsonb,'outMovementId',gen_random_uuid(),'inMovementId',gen_random_uuid()));
 END LOOP;
 SELECT jsonb_build_object('sourceName',a.name,'sourceCode',a.code,'sourceKind',a.kind,'destinationName',b.name,'destinationCode',b.code,'destinationKind',b.kind,'companyName',c.trade_name) INTO snapshot FROM organizations.units a JOIN organizations.units b ON b.tenant_id=a.tenant_id JOIN organizations.companies c ON c.tenant_id=a.tenant_id AND c.id=a.company_id WHERE a.tenant_id=net AND a.id=source AND b.id=destination;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO network.transfers(tenant_id,source_id,destination_id,items,unit_snapshot,reason,notes,actor_name,request_key,request_payload) VALUES(net,source,destination,items,snapshot,input->>'reason',input->>'notes',who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION network.transition_transfer(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();r network.transfers;action text:=input->>'action';branch uuid;line jsonb;piece jsonb;confirmed jsonb;items jsonb:='[]';amount numeric;total numeric:=0;who text;lot uuid;existing inventory.lots;BEGIN
 SELECT * INTO r FROM network.transfers WHERE tenant_id=net AND id=(input->>'id')::uuid FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Transferência indisponível' USING ERRCODE='42501';END IF;
 branch:=CASE WHEN action='receive' THEN r.destination_id ELSE r.source_id END;
 IF NOT inventory.allowed(net,'stock.manage',branch) OR (action IN('approve','cancel') AND NOT inventory.allowed(net,'stock.manage',r.destination_id)) THEN RAISE EXCEPTION 'Operação não autorizada nesta ponta' USING ERRCODE='42501';END IF;
 IF r.last_action=input THEN RETURN r.id;END IF;
 IF r.version<>(input->>'version')::integer OR NOT network.same_company(net,r.source_id,r.destination_id) THEN RAISE EXCEPTION 'Versão ou unidades indisponíveis' USING ERRCODE='P1001';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF action='approve' AND r.status='draft' THEN
  UPDATE network.transfers SET status='approved',version=version+1,approved_by=who,approved_at=clock_timestamp(),last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='cancel' AND r.status IN('draft','approved') AND length(btrim(input->>'reason')) BETWEEN 3 AND 300 THEN
  UPDATE network.transfers SET status='cancelled',version=version+1,cancelled_by=who,cancelled_at=clock_timestamp(),cancel_reason=input->>'reason',last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='dispatch' AND r.status='approved' AND length(btrim(input->>'documentRef')) BETWEEN 3 AND 120 THEN
  IF r.central_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM network.central_orders c JOIN purchasing.orders o ON o.tenant_id=c.tenant_id AND o.id=c.order_id WHERE c.tenant_id=net AND c.id=r.central_id AND c.distributed AND o.status='received') THEN RAISE EXCEPTION 'Compra central deve continuar recebida para expedir' USING ERRCODE='P1001';END IF;
  UPDATE network.transfers SET status='dispatching' WHERE tenant_id=net AND id=r.id;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
   INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,transfer_id,transfer_line_id,transfer_role) VALUES(net,(line->>'outMovementId')::uuid,r.source_id,(line->>'productId')::uuid,'out',(line->>'quantity')::numeric,0,false,left('Expedição '||r.number||' · '||(input->>'reason'),300),gen_random_uuid(),r.id,(line->>'id')::uuid,'out');
   SELECT -value_delta INTO amount FROM inventory.movements WHERE tenant_id=net AND id=(line->>'outMovementId')::uuid;total:=total+amount;
   items:=items||jsonb_build_array(line||jsonb_build_object('cost',amount::text,'lotTracked',EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=net AND unit_id=r.source_id AND product_id=(line->>'productId')::uuid),'lots',coalesce((SELECT jsonb_agg(jsonb_build_object('sourceLotId',b.id,'code',b.code,'manufacturedOn',b.manufactured_on,'expiresOn',b.expires_on,'quantity',(-e.quantity_delta)::text) ORDER BY b.expires_on,b.created_at,b.id) FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE e.tenant_id=net AND e.movement_id=(line->>'outMovementId')::uuid AND e.kind='transfer_out'),'[]')));
  END LOOP;
  UPDATE network.transfers SET status='in_transit',version=version+1,items=items,total_cost=total,document_ref=input->>'documentRef',dispatched_by=who,dispatched_at=clock_timestamp(),last_action=input WHERE tenant_id=net AND id=r.id;
 ELSIF action='receive' AND r.status='in_transit' THEN
  IF jsonb_array_length(input->'items')<>jsonb_array_length(r.items) THEN RAISE EXCEPTION 'Confira todos os itens recebidos' USING ERRCODE='P1001';END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
   SELECT value INTO confirmed FROM jsonb_array_elements(input->'items') WHERE value->>'lineId'=line->>'id';
   IF confirmed IS NULL OR (confirmed->>'quantity')::numeric<>(line->>'quantity')::numeric THEN RAISE EXCEPTION 'Divergência de quantidade mantém transferência em trânsito' USING ERRCODE='P1001';END IF;
  END LOOP;
  UPDATE network.transfers SET status='receiving' WHERE tenant_id=net AND id=r.id;
  FOR line IN SELECT value FROM jsonb_array_elements(r.items) LOOP
   IF (line->>'lotTracked')::boolean AND NOT EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=net AND unit_id=r.destination_id AND product_id=(line->>'productId')::uuid) THEN
    INSERT INTO inventory.levels(tenant_id,unit_id,product_id) VALUES(net,r.destination_id,(line->>'productId')::uuid) ON CONFLICT DO NOTHING;
    IF EXISTS(SELECT 1 FROM inventory.levels WHERE tenant_id=net AND unit_id=r.destination_id AND product_id=(line->>'productId')::uuid AND reserved>0) THEN RAISE EXCEPTION 'Regularize reservas antes de ativar lotes no destino' USING ERRCODE='P0801';END IF;
    INSERT INTO inventory.lot_controls(tenant_id,unit_id,product_id) VALUES(net,r.destination_id,(line->>'productId')::uuid);
   END IF;
   INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,cost,packaged,reason,request_key,transfer_id,transfer_line_id,transfer_role) VALUES(net,(line->>'inMovementId')::uuid,r.destination_id,(line->>'productId')::uuid,'entry',(line->>'quantity')::numeric,0,false,left('Conferência '||r.number||' · '||(input->>'reason'),300),gen_random_uuid(),r.id,(line->>'id')::uuid,'in');
   FOR piece IN SELECT value FROM jsonb_array_elements(line->'lots') LOOP
    SELECT * INTO existing FROM inventory.lots WHERE tenant_id=net AND unit_id=r.destination_id AND product_id=(line->>'productId')::uuid AND code=piece->>'code' AND expires_on=(piece->>'expiresOn')::date FOR UPDATE;
    IF existing.id IS NULL THEN INSERT INTO inventory.lots(tenant_id,unit_id,product_id,code,manufactured_on,expires_on) VALUES(net,r.destination_id,(line->>'productId')::uuid,piece->>'code',nullif(piece->>'manufacturedOn','')::date,(piece->>'expiresOn')::date) RETURNING id INTO lot;
    ELSE IF existing.manufactured_on IS DISTINCT FROM nullif(piece->>'manufacturedOn','')::date THEN RAISE EXCEPTION 'Identidade do lote diverge no destino' USING ERRCODE='P0801';END IF;lot:=existing.id;END IF;
    UPDATE inventory.lots SET quantity=quantity+(piece->>'quantity')::numeric,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=net AND id=lot;
    INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(net,r.destination_id,(line->>'productId')::uuid,lot,'transfer_in',(piece->>'quantity')::numeric,(line->>'inMovementId')::uuid,input->>'reason',who);
   END LOOP;
  END LOOP;
  UPDATE network.transfers SET status='received',version=version+1,received_by=who,received_at=clock_timestamp(),last_action=input WHERE tenant_id=net AND id=r.id;
 ELSE RAISE EXCEPTION 'Operação fora de sequência' USING ERRCODE='P1001';END IF;RETURN r.id;
END $$;
ALTER TABLE network.central_orders ADD COLUMN distribution_payload jsonb;
CREATE FUNCTION network.create_central(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;old network.central_orders;line jsonb;a jsonb;p inventory.products;allocations jsonb:='[]';order_items jsonb:='[]';q numeric;order_id uuid;target uuid;label text;BEGIN
 IF NOT inventory.allowed(net,'purchases.manage',branch) OR NOT inventory.allowed(net,'stock.manage',branch) THEN RAISE EXCEPTION 'Compra central não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM network.central_orders WHERE tenant_id=net AND request_key=(input->>'requestKey')::uuid;
 IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations.units WHERE tenant_id=net AND id=branch AND kind IN('matriz','cd','deposito')) OR jsonb_array_length(input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Selecione matriz, CD ou depósito para receber a compra central' USING ERRCODE='P1001';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=net AND id=(line->>'productId')::uuid AND active;
  IF p.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(order_items) x WHERE x->>'productId'=p.id::text) OR jsonb_array_length(line->'allocations') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Itens e distribuição inválidos' USING ERRCODE='23514';END IF;q:=0;
  FOR a IN SELECT value FROM jsonb_array_elements(line->'allocations') LOOP
   IF NOT inventory.allowed(net,'stock.manage',(a->>'unitId')::uuid) THEN RAISE EXCEPTION 'Destino da compra não autorizado' USING ERRCODE='42501';END IF;
   IF ((a->>'unitId')::uuid<>branch AND NOT network.same_company(net,branch,(a->>'unitId')::uuid)) OR (a->>'quantity')::numeric<=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(allocations) x WHERE x->>'productId'=p.id::text AND x->>'unitId'=a->>'unitId') THEN RAISE EXCEPTION 'Distribuição duplicada ou entre empresas distintas' USING ERRCODE='P1001';END IF;
   SELECT name INTO label FROM organizations.units WHERE tenant_id=net AND id=(a->>'unitId')::uuid;
   allocations:=allocations||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'code',p.code,'baseUnit',p.base_unit,'unitId',a->>'unitId','unitName',label,'quantity',a->>'quantity'));q:=q+(a->>'quantity')::numeric;
  END LOOP;
  order_items:=order_items||jsonb_build_array(jsonb_build_object('productId',p.id,'quantity',q::text,'unitCost',line->>'unitCost','packaged',false));
 END LOOP;
 IF jsonb_array_length(allocations)>100 THEN RAISE EXCEPTION 'Até cem destinações por compra' USING ERRCODE='23514';END IF;
 order_id:=purchasing.save_order(jsonb_build_object('unitId',branch,'supplierId',input->>'supplierId','items',order_items,'freight',input->>'freight','extraCost',input->>'extraCost','discount',input->>'discount','expectedDate',input->>'expectedDate','notes',input->>'notes','requestKey',input->>'requestKey'));
 INSERT INTO network.central_orders(tenant_id,unit_id,order_id,allocations,request_key,request_payload) VALUES(net,branch,order_id,allocations,(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION network.distribute_central(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();r network.central_orders;o purchasing.orders;destination uuid;items jsonb;transfer uuid;who text;BEGIN
 SELECT * INTO r FROM network.central_orders WHERE tenant_id=net AND id=(input->>'id')::uuid FOR UPDATE;
 IF r.id IS NULL OR NOT inventory.allowed(net,'purchases.manage',r.unit_id) OR NOT inventory.allowed(net,'stock.manage',r.unit_id) THEN RAISE EXCEPTION 'Distribuição não autorizada' USING ERRCODE='42501';END IF;
 IF r.distributed THEN IF r.distribution_payload=input THEN RETURN r.id;END IF;RAISE EXCEPTION 'Distribuição já gerada; consulte transferências vinculadas' USING ERRCODE='P1001';END IF;
 SELECT * INTO o FROM purchasing.orders WHERE tenant_id=net AND id=r.order_id;
 IF o.status<>'received' THEN RAISE EXCEPTION 'Receba integralmente a compra antes de gerar distribuição' USING ERRCODE='P1001';END IF;
 FOR destination IN SELECT DISTINCT (x->>'unitId')::uuid FROM jsonb_array_elements(r.allocations) x WHERE x->>'unitId'<>r.unit_id::text LOOP
  SELECT jsonb_agg(jsonb_build_object('productId',x->>'productId','quantity',x->>'quantity')) INTO items FROM jsonb_array_elements(r.allocations) x WHERE x->>'unitId'=destination::text;
  transfer:=network.create_transfer(jsonb_build_object('sourceId',r.unit_id,'destinationId',destination,'items',items,'reason',input->>'reason','notes','Distribuição planejada · '||o.number,'requestKey',gen_random_uuid()));
  UPDATE network.transfers SET central_id=r.id WHERE tenant_id=net AND id=transfer;
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE network.central_orders SET distributed=true,distributed_at=clock_timestamp(),distributed_by=who,distribution_payload=input WHERE tenant_id=net AND id=r.id;RETURN r.id;
END $$;
CREATE FUNCTION network.guard_central_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF OLD.status='draft' AND NEW.status='draft' AND EXISTS(SELECT 1 FROM network.central_orders WHERE tenant_id=OLD.tenant_id AND order_id=OLD.id) THEN RAISE EXCEPTION 'Compra central mantém plano congelado; cancele e crie outro para corrigir' USING ERRCODE='P1001';END IF;RETURN NEW;
END $$;
CREATE TRIGGER central_order_guard BEFORE UPDATE ON purchasing.orders FOR EACH ROW EXECUTE FUNCTION network.guard_central_order();
CREATE FUNCTION network.guard_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r network.transfers;line jsonb;BEGIN
 IF NEW.kind='reverse' AND EXISTS(SELECT 1 FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of AND transfer_id IS NOT NULL) THEN RAISE EXCEPTION 'Transferência não pode ser estornada isoladamente; use fluxo de devolução entre unidades' USING ERRCODE='P1001';END IF;
 IF NEW.transfer_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO r FROM network.transfers WHERE tenant_id=NEW.tenant_id AND id=NEW.transfer_id;
 SELECT value INTO line FROM jsonb_array_elements(r.items) WHERE value->>'id'=NEW.transfer_line_id::text AND value->>'productId'=NEW.product_id::text;
 IF r.id IS NULL OR line IS NULL OR NEW.packaged OR NEW.quantity<>(line->>'quantity')::numeric OR NEW.sale_id IS NOT NULL OR NEW.purchase_receipt_id IS NOT NULL OR NEW.production_run_id IS NOT NULL OR NEW.lot_id IS NOT NULL OR NOT ((NEW.transfer_role='out' AND NEW.kind='out' AND r.status='dispatching' AND NEW.unit_id=r.source_id AND NEW.id=(line->>'outMovementId')::uuid) OR (NEW.transfer_role='in' AND NEW.kind='entry' AND r.status='receiving' AND NEW.unit_id=r.destination_id AND NEW.id=(line->>'inMovementId')::uuid)) THEN RAISE EXCEPTION 'Origem da transferência inválida' USING ERRCODE='P1001';END IF;RETURN NEW;
END $$;
CREATE TRIGGER aa_network_origin BEFORE INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION network.guard_movement();
CREATE FUNCTION network.transfer_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE line jsonb;amount numeric;BEGIN
 IF NEW.transfer_role<>'in' OR NEW.transfer_role IS NULL THEN RETURN NEW;END IF;
 SELECT value INTO line FROM network.transfers r CROSS JOIN LATERAL jsonb_array_elements(r.items) x(value) WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.transfer_id AND x.value->>'id'=NEW.transfer_line_id::text;
 amount:=(line->>'cost')::numeric;IF amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Custo de trânsito indisponível' USING ERRCODE='P1001';END IF;
 -- Depois de confirm_stock, substituir a entrada de valor zero pelo custo exato expedido.
 NEW.value_after:=NEW.value_after-NEW.value_delta+amount;NEW.value_delta:=amount;NEW.cost:=round(amount/NEW.base_quantity,6);
 UPDATE inventory.levels SET value=NEW.value_after,last_cost=NEW.cost WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;RETURN NEW;
END $$;
CREATE TRIGGER network_transfer_cost BEFORE INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION network.transfer_cost();
CREATE FUNCTION network.guard_reserves() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NEW.transfer_role='out' AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN RAISE EXCEPTION 'Expedição não pode consumir lotes válidos reservados' USING ERRCODE='P0801';END IF;RETURN NEW;
END $$;
CREATE TRIGGER zz_network_reserves AFTER INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION network.guard_reserves();
CREATE FUNCTION network.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE after_value jsonb:=to_jsonb(NEW);before_value jsonb;kind text;label text;who text;branches uuid[];branch uuid;BEGIN
 IF TG_OP='UPDATE' THEN before_value:=to_jsonb(OLD);END IF;
 after_value:=after_value-ARRAY['tenant_id','request_key','request_payload','last_action','distribution_payload'];before_value:=before_value-ARRAY['tenant_id','request_key','request_payload','last_action','distribution_payload'];
 IF after_value IS NOT DISTINCT FROM before_value THEN RETURN NEW;END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 IF TG_TABLE_NAME='transfers' THEN kind:='transfer';label:=NEW.number;branches:=ARRAY[NEW.source_id,NEW.destination_id];ELSE kind:='central_purchase';label:='Compra centralizada';branches:=ARRAY[NEW.unit_id];END IF;
 FOREACH branch IN ARRAY branches LOOP
  INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,branch,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,CASE WHEN kind='transfer' THEN 'inventory' ELSE 'purchases' END,kind,NEW.id,kind||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,before_value,after_value,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_network_transfer AFTER INSERT OR UPDATE ON network.transfers FOR EACH ROW EXECUTE FUNCTION network.capture_audit();
CREATE TRIGGER audit_capture_network_central AFTER INSERT OR UPDATE ON network.central_orders FOR EACH ROW EXECUTE FUNCTION network.capture_audit();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA network FROM PUBLIC;
GRANT EXECUTE ON FUNCTION network.create_transfer(jsonb),network.transition_transfer(jsonb),network.create_central(jsonb),network.distribute_central(jsonb) TO invictus_auth;

-- Transferências também separam lotes por FEFO, sem alterar as pontes anteriores.
CREATE OR REPLACE FUNCTION inventory.lot_bridge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b inventory.lots;e inventory.lot_events;original inventory.movements;remaining numeric;taken numeric;event_name text;sum_lots numeric;
BEGIN
 PERFORM 1 FROM inventory.lot_controls WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
 IF NOT FOUND THEN IF NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'Lote sem controle' USING ERRCODE='P0801';END IF;RETURN NEW;END IF;
 IF NEW.reserved_delta>0 AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN RAISE EXCEPTION 'Saldo de lotes válidos insuficiente para reserva' USING ERRCODE='P0801';END IF;
 IF NEW.physical_delta<0 THEN
  remaining:=-NEW.physical_delta;
  IF (NEW.sale_id IS NOT NULL OR NEW.production_role='input' OR NEW.transfer_role='out') AND NEW.kind='out' THEN
   FOR b IN SELECT * FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id AND quantity>0 AND NOT blocked AND expires_on>=inventory.lot_today() ORDER BY expires_on,created_at,id FOR UPDATE LOOP
    taken:=least(remaining,b.quantity);UPDATE inventory.lots SET quantity=quantity-taken,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
    INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,CASE WHEN NEW.transfer_role='out' THEN 'transfer_out' WHEN NEW.production_role='input' THEN 'production_input' ELSE 'sale' END,-taken,NEW.id,NEW.reason,NEW.actor_name);
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

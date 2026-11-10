-- Etapa 08.1: identificação física por lote, mantendo o custo médio do estoque.
CREATE TABLE inventory.lot_controls(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,product_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 alert_days integer NOT NULL DEFAULT 30 CHECK(alert_days BETWEEN 1 AND 365),version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,unit_id,product_id),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id)
);
CREATE TABLE inventory.lots(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,product_id uuid NOT NULL,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 60),manufactured_on date,expires_on date NOT NULL,
 quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(quantity>=0),blocked boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,product_id,code),FOREIGN KEY(tenant_id,unit_id,product_id) REFERENCES inventory.lot_controls(tenant_id,unit_id,product_id),
 CHECK(manufactured_on IS NULL OR manufactured_on<=expires_on),CHECK(isfinite(expires_on) AND expires_on BETWEEN '0001-01-01' AND '9999-12-31'),CHECK(manufactured_on IS NULL OR (isfinite(manufactured_on) AND manufactured_on BETWEEN '0001-01-01' AND '9999-12-31'))
);
ALTER TABLE inventory.movements ADD COLUMN lot_id uuid;
ALTER TABLE inventory.movements ADD CONSTRAINT movement_lot_identity FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory.lots(tenant_id,id);
CREATE TABLE inventory.lot_events(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,product_id uuid NOT NULL,lot_id uuid,
 kind text NOT NULL CHECK(kind IN('allocate','withdraw','block','unblock','settings','sale','sale_return','loss','reversal','command')),
 quantity_delta numeric(18,3) NOT NULL DEFAULT 0,movement_id uuid,loss_kind text CHECK(loss_kind IN('expiration','damage','breakage','theft','other')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300),actor_name text NOT NULL,
 request_key uuid NOT NULL DEFAULT gen_random_uuid(),request_payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id,product_id) REFERENCES inventory.lot_controls(tenant_id,unit_id,product_id),
 FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory.lots(tenant_id,id),FOREIGN KEY(tenant_id,movement_id) REFERENCES inventory.movements(tenant_id,id)
);
CREATE UNIQUE INDEX lot_event_movement_once ON inventory.lot_events(tenant_id,movement_id,lot_id,kind) WHERE movement_id IS NOT NULL;
CREATE INDEX lots_fefo ON inventory.lots(tenant_id,unit_id,product_id,expires_on,created_at,id);
CREATE INDEX lot_events_time ON inventory.lot_events(tenant_id,unit_id,created_at DESC,id DESC);
DO $$ DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['lot_controls','lots','lot_events'] LOOP
 EXECUTE format('ALTER TABLE inventory.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE inventory.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY lot_read ON inventory.%I FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,''stock.read'',unit_id))',tab);
 EXECUTE format('CREATE POLICY lot_internal ON inventory.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
 EXECUTE format('GRANT SELECT ON inventory.%I TO invictus_auth',tab);
END LOOP;END $$;
CREATE FUNCTION inventory.lot_today() RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT (current_timestamp AT TIME ZONE 'America/Fortaleza')::date $$;
CREATE FUNCTION inventory.lot_sellable(network uuid,branch uuid,product uuid,physical numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN NOT(inventory.allowed(network,'stock.read',branch) OR pos.permitted(network,'pos.read',branch)) THEN 0
 WHEN EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=network AND unit_id=branch AND product_id=product)
 THEN coalesce((SELECT sum(quantity) FROM inventory.lots WHERE tenant_id=network AND unit_id=branch AND product_id=product AND NOT blocked AND expires_on>=inventory.lot_today()),0) ELSE physical END
$$;
CREATE FUNCTION inventory.lot_bridge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b inventory.lots;e inventory.lot_events;original inventory.movements;remaining numeric;taken numeric;event_name text;sum_lots numeric;
BEGIN
 PERFORM 1 FROM inventory.lot_controls WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
 IF NOT FOUND THEN IF NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'Lote sem controle' USING ERRCODE='P0801';END IF;RETURN NEW;END IF;
 IF NEW.reserved_delta>0 AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN RAISE EXCEPTION 'Saldo de lotes válidos insuficiente para reserva' USING ERRCODE='P0801';END IF;
 IF NEW.physical_delta<0 THEN
  remaining:=-NEW.physical_delta;
  IF NEW.sale_id IS NOT NULL AND NEW.kind='out' THEN
   FOR b IN SELECT * FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id AND quantity>0 AND NOT blocked AND expires_on>=inventory.lot_today() ORDER BY expires_on,created_at,id FOR UPDATE LOOP
    taken:=least(remaining,b.quantity);UPDATE inventory.lots SET quantity=quantity-taken,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
    INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,'sale',-taken,NEW.id,NEW.reason,NEW.actor_name);
    remaining:=remaining-taken;EXIT WHEN remaining=0;
   END LOOP;
   IF remaining>0 THEN RAISE EXCEPTION 'Venda exige saldo classificado em lotes válidos e não bloqueados' USING ERRCODE='P0801';END IF;
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
  ELSE SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of;event_name:='reversal';END IF;
  FOR e IN SELECT * FROM inventory.lot_events WHERE tenant_id=NEW.tenant_id AND movement_id=original.id AND kind IN('sale','loss') LOOP
   UPDATE inventory.lots SET quantity=quantity-e.quantity_delta,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=e.lot_id;
   INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,e.lot_id,event_name,-e.quantity_delta,NEW.id,NEW.reason,NEW.actor_name);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_lot_bridge AFTER INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION inventory.lot_bridge();
CREATE FUNCTION inventory.lot_command(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;product uuid:=(input->>'productId')::uuid;
 target uuid:=nullif(input->>'lotId','')::uuid;action_name text:=input->>'action';q numeric:=coalesce(nullif(input->>'quantity','')::numeric,0);b inventory.lots;s inventory.levels;c inventory.lot_controls;previous inventory.lot_events;who text;allocated numeric;delta numeric:=0;movement uuid;kind_name text;fresh boolean:=false;
BEGIN
 IF NOT inventory.allowed(network,'stock.manage',branch) THEN RAISE EXCEPTION 'Ação de lote não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO previous FROM inventory.lot_events WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN previous.lot_id;END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=product AND active) THEN RAISE EXCEPTION 'Produto inativo' USING ERRCODE='23514';END IF;
 INSERT INTO inventory.levels(tenant_id,unit_id,product_id) VALUES(network,branch,product) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM inventory.levels WHERE tenant_id=network AND unit_id=branch AND product_id=product FOR UPDATE;
 SELECT * INTO c FROM inventory.lot_controls WHERE tenant_id=network AND unit_id=branch AND product_id=product FOR UPDATE;
 IF c.id IS NULL THEN
  IF action_name NOT IN('allocate','settings') OR s.reserved<>0 THEN RAISE EXCEPTION 'Cancele reservas antes de ativar lotes' USING ERRCODE='P0801';END IF;
  INSERT INTO inventory.lot_controls(tenant_id,unit_id,product_id) VALUES(network,branch,product) RETURNING * INTO c;fresh:=true;
 END IF;
 IF action_name='settings' THEN
  IF NOT fresh AND c.version<>coalesce((input->>'version')::integer,-1) THEN RAISE EXCEPTION 'Controle desatualizado' USING ERRCODE='23514';END IF;
  UPDATE inventory.lot_controls SET alert_days=(input->>'alertDays')::integer,version=version+1 WHERE tenant_id=network AND unit_id=branch AND product_id=product;
 ELSE
  IF target IS NULL AND action_name='allocate' THEN
   IF q<=0 OR s.reserved<>0 OR nullif(input->>'manufacturedOn','')::date>inventory.lot_today() THEN RAISE EXCEPTION 'Quantidade, fabricação ou reserva impede classificação' USING ERRCODE='P0801';END IF;
   INSERT INTO inventory.lots(tenant_id,unit_id,product_id,code,manufactured_on,expires_on) VALUES(network,branch,product,input->>'code',nullif(input->>'manufacturedOn','')::date,(input->>'expiresOn')::date) RETURNING id INTO target;
  END IF;
  SELECT * INTO b FROM inventory.lots WHERE tenant_id=network AND id=target AND unit_id=branch AND product_id=product FOR UPDATE;
  IF b.id IS NULL OR (input->>'version' IS NOT NULL AND b.version<>(input->>'version')::integer) THEN RAISE EXCEPTION 'Lote desatualizado' USING ERRCODE='23514';END IF;
  CASE action_name
   WHEN 'allocate' THEN
    SELECT coalesce(sum(quantity),0) INTO allocated FROM inventory.lots WHERE tenant_id=network AND unit_id=branch AND product_id=product;
    IF s.reserved<>0 OR q<=0 OR allocated+q>s.physical THEN RAISE EXCEPTION 'Classificação exige saldo físico sem reservas; não cria entrada' USING ERRCODE='P0801';END IF;delta:=q;
   WHEN 'withdraw' THEN IF s.reserved<>0 OR q<=0 OR q>b.quantity THEN RAISE EXCEPTION 'Retirada de classificação indisponível' USING ERRCODE='P0801';END IF;delta:=-q;
   WHEN 'block' THEN UPDATE inventory.lots SET blocked=true WHERE tenant_id=network AND id=target;
   WHEN 'unblock' THEN UPDATE inventory.lots SET blocked=false WHERE tenant_id=network AND id=target;
   WHEN 'loss' THEN
    IF q<=0 OR q>b.quantity OR (input->>'lossKind'='expiration' AND b.expires_on>=inventory.lot_today()) THEN RAISE EXCEPTION 'Confira quantidade e motivo da perda' USING ERRCODE='P0801';END IF;
    PERFORM set_config('app.lot_loss_kind',input->>'lossKind',true);
    INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,lot_id) VALUES(network,branch,product,'loss',q,false,0,input->>'reason',(input->>'requestKey')::uuid,target) RETURNING id INTO movement;
   WHEN 'reverse' THEN
    IF NOT EXISTS(SELECT 1 FROM inventory.movements WHERE tenant_id=network AND id=(input->>'movementId')::uuid AND lot_id=target AND kind='loss') THEN RAISE EXCEPTION 'Descarte não encontrado' USING ERRCODE='23514';END IF;
    INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,reversal_of) VALUES(network,branch,product,'reverse',1,false,0,input->>'reason',(input->>'requestKey')::uuid,(input->>'movementId')::uuid) RETURNING id INTO movement;
   ELSE RAISE EXCEPTION 'Ação inválida' USING ERRCODE='23514';
  END CASE;
  IF action_name NOT IN('loss','reverse') THEN UPDATE inventory.lots SET quantity=quantity+delta,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;END IF;
 END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 kind_name:=CASE WHEN action_name IN('loss','reverse') THEN 'command' ELSE action_name END;
 INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,reason,actor_name,request_key,request_payload) VALUES(network,branch,product,target,kind_name,delta,input->>'reason',who,(input->>'requestKey')::uuid,input);
 RETURN target;
END $$;
CREATE FUNCTION inventory.sale_lots(target uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',m.sale_line_id,'lotId',b.id,'code',b.code,'expiresOn',b.expires_on,'quantity',(-e.quantity_delta)::text) ORDER BY m.sale_line_id,b.expires_on,b.id),'[]') FROM inventory.lot_events e JOIN inventory.movements m ON m.tenant_id=e.tenant_id AND m.id=e.movement_id JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE m.tenant_id=identity.current_auth_tenant_id() AND m.sale_id=target AND e.kind='sale' AND pos.permitted(m.tenant_id,'pos.read',m.unit_id)
$$;
CREATE OR REPLACE FUNCTION pos.catalog(branch uuid,query_text text,barcode_text text,offset_page integer) RETURNS TABLE(id uuid,code text,name text,base_unit text,category text,price numeric,available numeric,barcodes text[],total_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id,p.code,p.name,p.base_unit,p.category,p.sale_price,greatest(0,inventory.lot_sellable(p.tenant_id,branch,p.id,coalesce(l.physical,0))-coalesce(l.reserved,0)),p.barcodes,count(*) OVER()
 FROM inventory.products p LEFT JOIN inventory.levels l ON l.tenant_id=p.tenant_id AND l.unit_id=branch AND l.product_id=p.id
 WHERE p.tenant_id=identity.current_auth_tenant_id() AND pos.permitted(p.tenant_id,'pos.read',branch) AND p.active AND p.sale_price>0
 AND (barcode_text='' OR EXISTS(SELECT 1 FROM inventory.barcodes b WHERE b.tenant_id=p.tenant_id AND b.product_id=p.id AND b.barcode=lpad(barcode_text,14,'0')))
 AND (query_text='' OR position(lower(query_text) in lower(p.name||' '||p.code||' '||p.category||' '||array_to_string(p.barcodes,' ')))>0)
 ORDER BY p.name,p.id LIMIT 20 OFFSET greatest(0,least(offset_page,1000))*20
$$;
CREATE FUNCTION inventory.lot_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];source text;who text;label text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 CASE TG_TABLE_NAME WHEN 'lot_controls' THEN source:='lot_control';keys:=ARRAY['product_id','alert_days','version'];WHEN 'lots' THEN source:='lot';keys:=ARRAY['product_id','code','manufactured_on','expires_on','quantity','blocked','version'];ELSE source:='lot_event';keys:=ARRAY['product_id','lot_id','kind','quantity_delta','movement_id','loss_kind','reason','actor_name'];END CASE;
 SELECT name INTO label FROM inventory.products WHERE tenant_id=NEW.tenant_id AND id=NEW.product_id;SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,'inventory',source,NEW.id,source||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_lot_control AFTER INSERT OR UPDATE ON inventory.lot_controls FOR EACH ROW EXECUTE FUNCTION inventory.lot_audit();
CREATE TRIGGER audit_capture_lot AFTER INSERT OR UPDATE ON inventory.lots FOR EACH ROW EXECUTE FUNCTION inventory.lot_audit();
CREATE TRIGGER audit_capture_lot_event AFTER INSERT ON inventory.lot_events FOR EACH ROW EXECUTE FUNCTION inventory.lot_audit();
REVOKE ALL ON FUNCTION inventory.lot_today(),inventory.lot_sellable(uuid,uuid,uuid,numeric),inventory.lot_bridge(),inventory.lot_command(jsonb),inventory.sale_lots(uuid),inventory.lot_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory.lot_today(),inventory.lot_sellable(uuid,uuid,uuid,numeric),inventory.lot_command(jsonb),inventory.sale_lots(uuid) TO invictus_auth;

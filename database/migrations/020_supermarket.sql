-- Etapa 09.1: setores, pesagem manual, etiquetas internas e transformação de estoque.
CREATE SCHEMA supermarket;REVOKE ALL ON SCHEMA supermarket FROM PUBLIC;
CREATE TABLE supermarket.sectors(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 80),active boolean NOT NULL,version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id)
);
CREATE UNIQUE INDEX sector_name ON supermarket.sectors(tenant_id,unit_id,lower(name));
CREATE TABLE supermarket.product_profiles(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,product_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),sector_id uuid NOT NULL,
 weighted boolean NOT NULL,plu text CHECK(plu ~ '^[0-9]{5}$' AND plu<>'00000'),version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,unit_id,product_id),UNIQUE(tenant_id,id),UNIQUE(tenant_id,unit_id,plu),
 FOREIGN KEY(tenant_id,unit_id,sector_id) REFERENCES supermarket.sectors(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id),CHECK(NOT weighted OR plu IS NOT NULL)
);
CREATE TABLE supermarket.scales(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,name text NOT NULL,model text NOT NULL,
 mode text NOT NULL CHECK(mode IN('manual_kg','ean13_weight')),prefix text CHECK(prefix ~ '^2[0-9]$'),capacity numeric(6,3) NOT NULL CHECK(capacity>0 AND capacity<=99.999),resolution numeric(5,3) NOT NULL CHECK(resolution>0 AND resolution<=1),active boolean NOT NULL,reviewed boolean NOT NULL,version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),CHECK(resolution<=capacity),CHECK((mode='ean13_weight')=(prefix IS NOT NULL))
);
CREATE UNIQUE INDEX scale_name ON supermarket.scales(tenant_id,unit_id,lower(name));
CREATE TABLE supermarket.weighings(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,product_id uuid NOT NULL,scale_id uuid NOT NULL,lot_id uuid,
 gross numeric(6,3) NOT NULL,tare numeric(6,3) NOT NULL,net numeric(6,3) NOT NULL,price numeric(15,2) NOT NULL,total numeric(15,2) NOT NULL,barcode text,
 snapshot jsonb NOT NULL,source text NOT NULL DEFAULT 'manual' CHECK(source='manual'),actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id,scale_id) REFERENCES supermarket.scales(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id),FOREIGN KEY(tenant_id,lot_id) REFERENCES inventory.lots(tenant_id,id),CHECK(tare>=0 AND gross>tare AND net=gross-tare AND price>0 AND total=round(net*price,2) AND total>0)
);
CREATE TABLE supermarket.recipes(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,sector_id uuid NOT NULL,name text NOT NULL,output_product_id uuid NOT NULL,yield_quantity numeric(15,3) NOT NULL CHECK(yield_quantity>0),ingredients jsonb NOT NULL,notes text NOT NULL,active boolean NOT NULL,reviewed boolean NOT NULL,version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,unit_id,sector_id) REFERENCES supermarket.sectors(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,output_product_id) REFERENCES inventory.products(tenant_id,id),CHECK(jsonb_array_length(ingredients) BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX recipe_name ON supermarket.recipes(tenant_id,unit_id,lower(name));
CREATE TABLE supermarket.runs(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,recipe_id uuid NOT NULL,recipe_version integer NOT NULL,
 status text NOT NULL CHECK(status IN('posting','confirmed','reversing','reversed')),factor numeric(9,3) NOT NULL CHECK(factor>0),output_product_id uuid NOT NULL,expected_quantity numeric(15,3) NOT NULL,actual_quantity numeric(15,3) NOT NULL CHECK(actual_quantity>0 AND actual_quantity<=expected_quantity),total_cost numeric(24,6) NOT NULL DEFAULT 0,
 input_items jsonb NOT NULL,output_movement_id uuid NOT NULL,output_lot_id uuid,lot_code text NOT NULL,expires_on date NOT NULL,snapshot jsonb NOT NULL,
 reason text NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reversed_at timestamptz,reversed_by text,reversal_reason text,reversal_key uuid,request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,reversal_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,recipe_id) REFERENCES supermarket.recipes(tenant_id,id),FOREIGN KEY(tenant_id,output_product_id) REFERENCES inventory.products(tenant_id,id),FOREIGN KEY(tenant_id,output_lot_id) REFERENCES inventory.lots(tenant_id,id)
);
ALTER TABLE inventory.movements ADD COLUMN production_run_id uuid;ALTER TABLE inventory.movements ADD COLUMN production_line_id uuid;ALTER TABLE inventory.movements ADD COLUMN production_role text;
ALTER TABLE inventory.movements ADD CONSTRAINT movement_production_source FOREIGN KEY(tenant_id,production_run_id) REFERENCES supermarket.runs(tenant_id,id);
ALTER TABLE inventory.movements ADD CONSTRAINT movement_production_pair CHECK((production_run_id IS NULL AND production_line_id IS NULL AND production_role IS NULL) OR (production_run_id IS NOT NULL AND production_line_id IS NOT NULL AND production_role IN('input','output','reverse_input','reverse_output')));
CREATE UNIQUE INDEX production_movement_once ON inventory.movements(tenant_id,production_run_id,production_line_id,production_role) WHERE production_run_id IS NOT NULL;
ALTER TABLE inventory.lot_events DROP CONSTRAINT lot_events_kind_check;
ALTER TABLE inventory.lot_events ADD CONSTRAINT lot_events_kind_check CHECK(kind IN('allocate','withdraw','block','unblock','settings','sale','sale_return','loss','reversal','command','production_input','production_output','production_reverse_input','production_reverse_output'));
GRANT USAGE ON SCHEMA supermarket TO invictus_auth;
DO $$DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['sectors','product_profiles','scales','weighings','recipes','runs'] LOOP
 EXECUTE format('ALTER TABLE supermarket.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE supermarket.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY market_read ON supermarket.%I FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,''stock.read'',unit_id))',tab);
 EXECUTE format('CREATE POLICY market_internal ON supermarket.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
 EXECUTE format('GRANT SELECT ON supermarket.%I TO invictus_auth',tab);
END LOOP;END $$;
CREATE INDEX weighings_time ON supermarket.weighings(tenant_id,unit_id,created_at DESC,id DESC);CREATE INDEX runs_time ON supermarket.runs(tenant_id,unit_id,created_at DESC,id DESC);
CREATE FUNCTION supermarket.check_digit(code text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$DECLARE total integer:=0;i integer;BEGIN IF code !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'Código inválido' USING ERRCODE='23514';END IF;FOR i IN 1..12 LOOP total:=total+substring(code,i,1)::integer*CASE WHEN i%2=0 THEN 3 ELSE 1 END;END LOOP;RETURN ((10-total%10)%10)::text;END $$;
CREATE FUNCTION supermarket.decode_label(branch uuid,code text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();p inventory.products;profile supermarket.product_profiles;grams integer;BEGIN
 IF NOT (pos.permitted(network,'pos.read',branch) OR inventory.allowed(network,'stock.read',branch)) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501';END IF;
 IF length(code)<>13 OR NOT EXISTS(SELECT 1 FROM supermarket.scales WHERE tenant_id=network AND unit_id=branch AND prefix=left(code,2)) THEN RETURN NULL;END IF;
 IF code !~ '^[0-9]{13}$' OR right(code,1)<>supermarket.check_digit(left(code,12)) THEN RAISE EXCEPTION 'Etiqueta com dígito inválido' USING ERRCODE='P0901';END IF;
 IF NOT EXISTS(SELECT 1 FROM supermarket.scales WHERE tenant_id=network AND unit_id=branch AND prefix=left(code,2) AND active AND reviewed AND mode='ean13_weight') THEN RAISE EXCEPTION 'Formato de etiqueta inativo' USING ERRCODE='P0901';END IF;
 SELECT x.* INTO profile FROM supermarket.product_profiles x JOIN supermarket.sectors s ON s.tenant_id=x.tenant_id AND s.id=x.sector_id AND s.unit_id=branch AND s.active WHERE x.tenant_id=network AND x.unit_id=branch AND x.plu=substring(code,3,5) AND x.weighted;
 SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=profile.product_id AND active AND base_unit='KG' AND sale_price>0;
 grams:=substring(code,8,5)::integer;IF p.id IS NULL OR grams<=0 THEN RAISE EXCEPTION 'PLU, setor, peso ou produto indisponível' USING ERRCODE='P0901';END IF;
 RETURN jsonb_build_object('productId',p.id,'quantity',(grams::numeric/1000)::numeric(6,3)::text,'price',p.sale_price::text,'barcode',code,'source','label','product',jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'baseUnit',p.base_unit,'category',p.category,'price',p.sale_price::text,'available',greatest(0,inventory.lot_sellable(network,branch,p.id,coalesce((SELECT physical FROM inventory.levels WHERE tenant_id=network AND unit_id=branch AND product_id=p.id),0))-coalesce((SELECT reserved FROM inventory.levels WHERE tenant_id=network AND unit_id=branch AND product_id=p.id),0))::text,'barcodes','[]'::jsonb));
END $$;
CREATE FUNCTION supermarket.guard_barcode() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF EXISTS(SELECT 1 FROM supermarket.scales WHERE tenant_id=NEW.tenant_id AND prefix=substring(NEW.barcode,2,2) AND NEW.barcode LIKE '0%') THEN RAISE EXCEPTION 'Prefixo reservado para etiquetas internas' USING ERRCODE='P0901';END IF;RETURN NEW;END $$;
CREATE TRIGGER reserved_scale_barcode BEFORE INSERT ON inventory.barcodes FOR EACH ROW EXECUTE FUNCTION supermarket.guard_barcode();
CREATE FUNCTION supermarket.save_config(input jsonb,kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;target uuid:=nullif(input->>'id','')::uuid;s supermarket.sectors;sc supermarket.scales;pr supermarket.product_profiles;BEGIN
 IF NOT inventory.allowed(network,'stock.manage',branch) THEN RAISE EXCEPTION 'Configuração não autorizada' USING ERRCODE='42501';END IF;
 IF kind='sector' THEN
  IF target IS NULL THEN INSERT INTO supermarket.sectors(tenant_id,unit_id,name,active) VALUES(network,branch,input->>'name',(input->>'active')::boolean) RETURNING id INTO target;
  ELSE UPDATE supermarket.sectors SET name=input->>'name',active=(input->>'active')::boolean,version=version+1 WHERE tenant_id=network AND unit_id=branch AND id=target AND version=(input->>'version')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'Setor desatualizado' USING ERRCODE='23514';END IF;END IF;
 ELSIF kind='product' THEN
  SELECT * INTO s FROM supermarket.sectors WHERE tenant_id=network AND unit_id=branch AND id=(input->>'sectorId')::uuid AND active;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=(input->>'productId')::uuid AND active AND (NOT(input->>'weighted')::boolean OR base_unit='KG')) THEN RAISE EXCEPTION 'Setor ou unidade KG exigidos' USING ERRCODE='23514';END IF;
  SELECT * INTO pr FROM supermarket.product_profiles WHERE tenant_id=network AND unit_id=branch AND product_id=(input->>'productId')::uuid;
  IF pr.id IS NULL THEN INSERT INTO supermarket.product_profiles(tenant_id,unit_id,product_id,sector_id,weighted,plu) VALUES(network,branch,(input->>'productId')::uuid,s.id,(input->>'weighted')::boolean,nullif(input->>'plu','')) RETURNING id INTO target;
  ELSE IF pr.version<>coalesce((input->>'version')::integer,-1) OR (pr.plu IS NOT NULL AND pr.plu IS DISTINCT FROM nullif(input->>'plu','')) THEN RAISE EXCEPTION 'PLU permanente ou perfil desatualizado' USING ERRCODE='23514';END IF;
   UPDATE supermarket.product_profiles SET plu=nullif(input->>'plu',''),sector_id=s.id,weighted=(input->>'weighted')::boolean,version=version+1 WHERE tenant_id=network AND id=pr.id RETURNING id INTO target;END IF;
 ELSIF kind='scale' THEN
  IF EXISTS(SELECT 1 FROM inventory.barcodes WHERE tenant_id=network AND barcode LIKE '0'||(input->>'prefix')||'%' AND input->>'mode'='ean13_weight') THEN RAISE EXCEPTION 'Prefixo colide com código de produto' USING ERRCODE='P0901';END IF;
  IF (input->>'active')::boolean AND NOT(input->>'reviewed')::boolean THEN RAISE EXCEPTION 'Confira configuração antes de ativar' USING ERRCODE='23514';END IF;
  IF target IS NOT NULL THEN SELECT * INTO sc FROM supermarket.scales WHERE tenant_id=network AND id=target AND unit_id=branch;IF sc.id IS NULL OR sc.version<>(input->>'version')::integer OR sc.prefix IS DISTINCT FROM nullif(input->>'prefix','') OR sc.mode<>input->>'mode' THEN RAISE EXCEPTION 'Formato permanente ou balança desatualizada' USING ERRCODE='23514';END IF;END IF;
  IF target IS NULL THEN INSERT INTO supermarket.scales(tenant_id,unit_id,name,model,mode,prefix,capacity,resolution,active,reviewed) VALUES(network,branch,input->>'name',input->>'model',input->>'mode',nullif(input->>'prefix',''),(input->>'capacity')::numeric,(input->>'resolution')::numeric,(input->>'active')::boolean,(input->>'reviewed')::boolean) RETURNING id INTO target;
  ELSE UPDATE supermarket.scales SET name=input->>'name',model=input->>'model',capacity=(input->>'capacity')::numeric,resolution=(input->>'resolution')::numeric,active=(input->>'active')::boolean,reviewed=(input->>'reviewed')::boolean,version=version+1 WHERE tenant_id=network AND id=target;END IF;
 ELSE RAISE EXCEPTION 'Configuração inválida' USING ERRCODE='23514';END IF;RETURN target;
END $$;
CREATE FUNCTION supermarket.weigh(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;sc supermarket.scales;p inventory.products;pr supermarket.product_profiles;b inventory.lots;old supermarket.weighings;gross numeric:=(input->>'gross')::numeric;tare numeric:=(input->>'tare')::numeric;net numeric;code text;who text;target uuid;BEGIN
 IF NOT inventory.allowed(network,'stock.manage',branch) THEN RAISE EXCEPTION 'Pesagem não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM supermarket.weighings WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;IF old.id IS NOT NULL THEN IF old.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN old.id;END IF;
 SELECT * INTO sc FROM supermarket.scales WHERE tenant_id=network AND unit_id=branch AND id=(input->>'scaleId')::uuid AND active AND reviewed;
 SELECT x.* INTO pr FROM supermarket.product_profiles x JOIN supermarket.sectors s ON s.tenant_id=x.tenant_id AND s.id=x.sector_id AND s.active WHERE x.tenant_id=network AND x.unit_id=branch AND x.product_id=(input->>'productId')::uuid AND x.weighted;
 SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=pr.product_id AND active AND base_unit='KG' AND sale_price>0;
 net:=gross-tare;IF sc.id IS NULL OR p.id IS NULL OR NOT(input->>'stable')::boolean OR gross>sc.capacity OR tare<0 OR net<=0 OR mod(gross,sc.resolution)<>0 OR mod(tare,sc.resolution)<>0 OR round(net*p.sale_price,2)<=0 THEN RAISE EXCEPTION 'Confira capacidade, resolução, tara e peso confirmado' USING ERRCODE='P0901';END IF;
 IF EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=network AND unit_id=branch AND product_id=p.id) THEN
  SELECT * INTO b FROM inventory.lots WHERE tenant_id=network AND unit_id=branch AND product_id=p.id AND id=nullif(input->>'lotId','')::uuid AND NOT blocked AND expires_on>=inventory.lot_today() AND quantity>=net;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Selecione um lote válido com saldo' USING ERRCODE='P0801';END IF;
 ELSIF nullif(input->>'lotId','') IS NOT NULL THEN RAISE EXCEPTION 'Lote não pertence ao controle deste produto' USING ERRCODE='P0801';END IF;
 IF sc.mode='ean13_weight' THEN code:=sc.prefix||pr.plu||lpad((net*1000)::integer::text,5,'0');code:=code||supermarket.check_digit(code);END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO supermarket.weighings(tenant_id,unit_id,product_id,scale_id,lot_id,gross,tare,net,price,total,barcode,snapshot,actor_name,request_key,request_payload) VALUES(network,branch,p.id,sc.id,b.id,gross,tare,net,p.sale_price,round(net*p.sale_price,2),code,jsonb_build_object('productName',p.name,'productCode',p.code,'plu',pr.plu,'scaleName',sc.name,'scaleModel',sc.model,'lotCode',b.code,'expiresOn',b.expires_on,'manufacturedOn',b.manufactured_on,'format',sc.mode,'prefix',sc.prefix),who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION supermarket.save_recipe(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;target uuid:=nullif(input->>'id','')::uuid;line jsonb;p inventory.products;items jsonb:='[]';BEGIN
 IF NOT inventory.allowed(network,'stock.manage',branch) THEN RAISE EXCEPTION 'Ficha não autorizada' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM supermarket.sectors WHERE tenant_id=network AND unit_id=branch AND id=(input->>'sectorId')::uuid AND active) OR NOT EXISTS(SELECT 1 FROM inventory.products WHERE tenant_id=network AND id=(input->>'outputProductId')::uuid AND active) OR jsonb_array_length(input->'ingredients') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Setor, saída ou insumos inválidos' USING ERRCODE='23514';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(input->'ingredients') LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active;
  IF p.id IS NULL OR p.id=(input->>'outputProductId')::uuid OR (line->>'quantity')::numeric<=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE x->>'productId'=p.id::text) THEN RAISE EXCEPTION 'Insumos devem ser distintos do produto de saída' USING ERRCODE='23514';END IF;
  items:=items||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'code',p.code,'baseUnit',p.base_unit,'quantity',line->>'quantity'));
 END LOOP;
 IF target IS NULL THEN INSERT INTO supermarket.recipes(tenant_id,unit_id,sector_id,name,output_product_id,yield_quantity,ingredients,notes,active,reviewed) VALUES(network,branch,(input->>'sectorId')::uuid,input->>'name',(input->>'outputProductId')::uuid,(input->>'yieldQuantity')::numeric,items,input->>'notes',(input->>'active')::boolean,(input->>'reviewed')::boolean) RETURNING id INTO target;
 ELSE UPDATE supermarket.recipes SET sector_id=(input->>'sectorId')::uuid,name=input->>'name',output_product_id=(input->>'outputProductId')::uuid,yield_quantity=(input->>'yieldQuantity')::numeric,ingredients=items,notes=input->>'notes',active=(input->>'active')::boolean,reviewed=(input->>'reviewed')::boolean,version=version+1 WHERE tenant_id=network AND unit_id=branch AND id=target AND version=(input->>'version')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'Ficha desatualizada' USING ERRCODE='23514';END IF;END IF;RETURN target;
END $$;
CREATE FUNCTION supermarket.confirm_run(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();branch uuid:=(input->>'unitId')::uuid;r supermarket.recipes;previous supermarket.runs;target uuid:=gen_random_uuid();line jsonb;items jsonb:='[]';done jsonb:='[]';p inventory.products;output inventory.products;factor numeric:=(input->>'factor')::numeric;actual numeric:=(input->>'actualQuantity')::numeric;expected numeric;amount numeric;cost numeric:=0;line_cost numeric;movement uuid;out_movement uuid:=gen_random_uuid();lot uuid;who text;earliest date;BEGIN
 IF NOT inventory.allowed(network,'stock.manage',branch) THEN RAISE EXCEPTION 'Produção não autorizada' USING ERRCODE='42501';END IF;
 SELECT * INTO previous FROM supermarket.runs WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Confirmação reutilizada' USING ERRCODE='23514';END IF;RETURN previous.id;END IF;
 SELECT x.* INTO r FROM supermarket.recipes x JOIN supermarket.sectors s ON s.tenant_id=x.tenant_id AND s.id=x.sector_id AND s.active WHERE x.tenant_id=network AND x.unit_id=branch AND x.id=(input->>'recipeId')::uuid AND x.active AND x.reviewed FOR SHARE OF x;
 SELECT * INTO output FROM inventory.products WHERE tenant_id=network AND id=r.output_product_id AND active;
 expected:=r.yield_quantity*factor;
 IF r.id IS NULL OR output.id IS NULL OR r.version<>(input->>'recipeVersion')::integer OR factor<=0 OR actual<=0 OR actual>expected OR round(expected,3)<>expected OR (input->>'expiresOn')::date<inventory.lot_today() THEN RAISE EXCEPTION 'Confira ficha revisada, versão, rendimento e validade' USING ERRCODE='P0901';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(r.ingredients) LOOP
  SELECT * INTO p FROM inventory.products WHERE tenant_id=network AND id=(line->>'productId')::uuid AND active;
  amount:=(line->>'quantity')::numeric*factor;
  IF p.id IS NULL OR p.id=output.id OR amount<=0 OR round(amount,3)<>amount THEN RAISE EXCEPTION 'Insumo ou quantidade indisponível' USING ERRCODE='23514';END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',p.id,'name',p.name,'code',p.code,'baseUnit',p.base_unit,'quantity',amount::text,'movementId',gen_random_uuid()));
 END LOOP;
 -- Saldo da saída pode existir; ativar lotes não pode interromper reservas antigas desconhecidas.
 INSERT INTO inventory.levels(tenant_id,unit_id,product_id) VALUES(network,branch,output.id) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM inventory.levels WHERE tenant_id=network AND unit_id=branch AND (product_id=output.id OR product_id IN(SELECT (x->>'productId')::uuid FROM jsonb_array_elements(items) x)) ORDER BY product_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=network AND unit_id=branch AND product_id=output.id) THEN
  IF EXISTS(SELECT 1 FROM inventory.levels WHERE tenant_id=network AND unit_id=branch AND product_id=output.id AND reserved>0) THEN RAISE EXCEPTION 'Cancele reservas antes de ativar lote de saída' USING ERRCODE='P0801';END IF;
  INSERT INTO inventory.lot_controls(tenant_id,unit_id,product_id) VALUES(network,branch,output.id);
 END IF;
 INSERT INTO inventory.lots(tenant_id,unit_id,product_id,code,manufactured_on,expires_on) VALUES(network,branch,output.id,input->>'lotCode',inventory.lot_today(),(input->>'expiresOn')::date) RETURNING id INTO lot;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO supermarket.runs(tenant_id,id,unit_id,recipe_id,recipe_version,status,factor,output_product_id,expected_quantity,actual_quantity,input_items,output_movement_id,output_lot_id,lot_code,expires_on,snapshot,reason,actor_name,request_key,request_payload) VALUES(network,target,branch,r.id,r.version,'posting',factor,output.id,expected,actual,items,out_movement,lot,input->>'lotCode',(input->>'expiresOn')::date,jsonb_build_object('recipeName',r.name,'recipeNotes',r.notes,'outputName',output.name,'outputCode',output.code,'outputUnit',output.base_unit,'yieldLoss',(expected-actual)::text),input->>'reason',who,(input->>'requestKey')::uuid,input);
 FOR line IN SELECT value FROM jsonb_array_elements(items) LOOP
  INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,production_run_id,production_line_id,production_role) VALUES(network,(line->>'movementId')::uuid,branch,(line->>'productId')::uuid,'out',(line->>'quantity')::numeric,false,0,'Produção · '||left(input->>'reason',270),gen_random_uuid(),target,(line->>'id')::uuid,'input');
  SELECT -value_delta INTO line_cost FROM inventory.movements WHERE tenant_id=network AND id=(line->>'movementId')::uuid;cost:=cost+line_cost;
  SELECT min(b.expires_on) INTO earliest FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE e.tenant_id=network AND e.movement_id=(line->>'movementId')::uuid AND e.kind='production_input';
  IF earliest IS NOT NULL AND (input->>'expiresOn')::date>earliest THEN RAISE EXCEPTION 'Saída não pode superar a menor validade consumida' USING ERRCODE='P0901';END IF;
  done:=done||jsonb_build_array(line||jsonb_build_object('cost',line_cost::text,'lots',coalesce((SELECT jsonb_agg(jsonb_build_object('lotId',b.id,'code',b.code,'expiresOn',b.expires_on,'quantity',(-e.quantity_delta)::text)) FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE e.tenant_id=network AND e.movement_id=(line->>'movementId')::uuid AND e.kind='production_input'),'[]')));
 END LOOP;
 UPDATE supermarket.runs SET total_cost=cost,input_items=done WHERE tenant_id=network AND id=target;
 INSERT INTO inventory.movements(tenant_id,id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,production_run_id,production_line_id,production_role) VALUES(network,out_movement,branch,output.id,'entry',actual,false,0,'Saída de produção · '||left(input->>'reason',270),gen_random_uuid(),target,output.id,'output');
 UPDATE inventory.lots SET quantity=actual,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=lot;
 INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(network,branch,output.id,lot,'production_output',actual,out_movement,input->>'reason',who);
 UPDATE supermarket.runs SET status='confirmed' WHERE tenant_id=network AND id=target;RETURN target;
END $$;
CREATE FUNCTION supermarket.reverse_run(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();r supermarket.runs;line jsonb;who text;BEGIN
 SELECT * INTO r FROM supermarket.runs WHERE tenant_id=network AND id=(input->>'id')::uuid FOR UPDATE;
 IF r.id IS NULL OR NOT inventory.allowed(network,'stock.manage',r.unit_id) THEN RAISE EXCEPTION 'Produção não autorizada' USING ERRCODE='42501';END IF;
 IF r.status='reversed' AND r.reversal_key=(input->>'requestKey')::uuid AND r.reversal_reason=input->>'reason' THEN RETURN r.id;END IF;
 IF r.status<>'confirmed' THEN RAISE EXCEPTION 'Produção não reversível' USING ERRCODE='23514';END IF;
 UPDATE supermarket.runs SET status='reversing' WHERE tenant_id=network AND id=r.id;
 INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,reversal_of,production_run_id,production_line_id,production_role) VALUES(network,r.unit_id,r.output_product_id,'reverse',1,false,0,input->>'reason',gen_random_uuid(),r.output_movement_id,r.id,r.output_product_id,'reverse_output');
 FOR line IN SELECT value FROM jsonb_array_elements(r.input_items) LOOP
  INSERT INTO inventory.movements(tenant_id,unit_id,product_id,kind,quantity,packaged,cost,reason,request_key,reversal_of,production_run_id,production_line_id,production_role) VALUES(network,r.unit_id,(line->>'productId')::uuid,'reverse',1,false,0,input->>'reason',gen_random_uuid(),(line->>'movementId')::uuid,r.id,(line->>'id')::uuid,'reverse_input');
 END LOOP;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE supermarket.runs SET status='reversed',reversed_at=clock_timestamp(),reversed_by=who,reversal_reason=input->>'reason',reversal_key=(input->>'requestKey')::uuid WHERE tenant_id=network AND id=r.id;RETURN r.id;
END $$;
CREATE FUNCTION supermarket.guard_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NEW.status IN('draft','pending','confirmed') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) x JOIN supermarket.product_profiles p ON p.tenant_id=NEW.tenant_id AND p.unit_id=NEW.unit_id AND p.product_id=(x->>'productId')::uuid JOIN supermarket.sectors s ON s.tenant_id=p.tenant_id AND s.id=p.sector_id WHERE NOT s.active) THEN RAISE EXCEPTION 'Setor inativo; regularize antes de vender' USING ERRCODE='P0901';END IF;RETURN NEW;
END $$;
CREATE TRIGGER supermarket_sale BEFORE INSERT OR UPDATE ON pos.sales FOR EACH ROW EXECUTE FUNCTION supermarket.guard_sale();
CREATE FUNCTION supermarket.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];source text;label text;who text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 CASE TG_TABLE_NAME WHEN 'sectors' THEN source:='sector';keys:=ARRAY['name','active','version'];label:=NEW.name;
 WHEN 'product_profiles' THEN source:='weighed_product';keys:=ARRAY['product_id','sector_id','weighted','plu','version'];
 WHEN 'scales' THEN source:='scale';keys:=ARRAY['name','model','mode','prefix','capacity','resolution','active','reviewed','version'];label:=NEW.name;
 WHEN 'weighings' THEN source:='weighing';keys:=ARRAY['product_id','scale_id','lot_id','gross','tare','net','price','total','barcode','snapshot','source','actor_name'];
 WHEN 'recipes' THEN source:='recipe';keys:=ARRAY['sector_id','name','output_product_id','yield_quantity','ingredients','notes','active','reviewed','version'];label:=NEW.name;
 ELSE source:='production';keys:=ARRAY['recipe_id','recipe_version','status','factor','output_product_id','expected_quantity','actual_quantity','total_cost','input_items','output_lot_id','lot_code','expires_on','snapshot','reason','reversed_at','reversed_by','reversal_reason'];END CASE;
 label:=coalesce(label,'Supermercado · '||source);SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,'inventory',source,NEW.id,source||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
DO $$DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['sectors','product_profiles','scales','weighings','recipes','runs'] LOOP EXECUTE format('CREATE TRIGGER audit_capture_market_%I AFTER INSERT OR UPDATE ON supermarket.%I FOR EACH ROW EXECUTE FUNCTION supermarket.capture_audit()',tab,tab);END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA supermarket FROM PUBLIC;
GRANT EXECUTE ON FUNCTION supermarket.save_config(jsonb,text),supermarket.weigh(jsonb),supermarket.save_recipe(jsonb),supermarket.confirm_run(jsonb),supermarket.reverse_run(jsonb),supermarket.decode_label(uuid,text) TO invictus_auth;

-- Pontes de domínio preservam os cálculos e proteções anteriores.
CREATE OR REPLACE FUNCTION inventory.confirm_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p inventory.products; s inventory.levels; original inventory.movements; latest uuid; actor text; purchase_item jsonb; receipt purchasing.receipts; sale_record pos.sales; sale_item jsonb;prod_record supermarket.runs;prod_line jsonb;
BEGIN
 IF NOT inventory.allowed(NEW.tenant_id,'stock.manage',NEW.unit_id) AND NOT (NEW.sale_id IS NOT NULL AND pos.permitted(NEW.tenant_id,CASE WHEN NEW.kind='entry' THEN 'pos.refund' ELSE 'pos.sell' END,NEW.unit_id)) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501'; END IF;
 IF NEW.sale_id IS NOT NULL THEN
  SELECT * INTO sale_record FROM pos.sales WHERE tenant_id=NEW.tenant_id AND id=NEW.sale_id AND unit_id=NEW.unit_id;
  SELECT value INTO sale_item FROM jsonb_array_elements(sale_record.items) WHERE value->>'id'=NEW.sale_line_id::text AND value->>'productId'=NEW.product_id::text;
  IF sale_item IS NULL OR NEW.packaged OR NEW.quantity<>(sale_item->>'quantity')::numeric OR NOT ((NEW.kind='out' AND sale_record.status='pending' AND NEW.id=(sale_item->>'movementId')::uuid) OR (NEW.kind='entry' AND sale_record.status='returned' AND NEW.id=(sale_item->>'returnMovementId')::uuid)) THEN RAISE EXCEPTION 'Origem de venda inválida' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.production_run_id IS NOT NULL THEN
  SELECT * INTO prod_record FROM supermarket.runs WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND id=NEW.production_run_id;
  IF NEW.production_role='input' THEN
   SELECT value INTO prod_line FROM jsonb_array_elements(prod_record.input_items) WHERE value->>'id'=NEW.production_line_id::text AND value->>'productId'=NEW.product_id::text AND value->>'movementId'=NEW.id::text;
   IF prod_record.status<>'posting' OR prod_line IS NULL OR NEW.kind<>'out' OR NEW.packaged OR NEW.quantity<>(prod_line->>'quantity')::numeric THEN RAISE EXCEPTION 'Origem de insumo inválida' USING ERRCODE='P0901';END IF;
  ELSIF NEW.production_role='output' THEN
   IF prod_record.status<>'posting' OR prod_record.output_product_id<>NEW.product_id OR NEW.production_line_id<>NEW.product_id OR prod_record.output_movement_id<>NEW.id OR NEW.kind<>'entry' OR NEW.packaged OR NEW.quantity<>prod_record.actual_quantity THEN RAISE EXCEPTION 'Origem de saída inválida' USING ERRCODE='P0901';END IF;
  ELSE
   IF prod_record.status<>'reversing' OR NEW.kind<>'reverse' OR NOT EXISTS(SELECT 1 FROM inventory.movements m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.reversal_of AND m.production_run_id=NEW.production_run_id AND m.production_line_id=NEW.production_line_id AND m.product_id=NEW.product_id AND m.production_role=CASE NEW.production_role WHEN 'reverse_input' THEN 'input' WHEN 'reverse_output' THEN 'output' ELSE '?' END) THEN RAISE EXCEPTION 'Estorno de produção inválido' USING ERRCODE='P0901';END IF;
  END IF;
  IF prod_record.id IS NULL THEN RAISE EXCEPTION 'Produção indisponível' USING ERRCODE='P0901';END IF;
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
 IF NEW.production_role='output' THEN NEW.value_delta:=prod_record.total_cost;NEW.cost:=round(NEW.value_delta/NEW.base_quantity,6);s.last_cost:=NEW.cost;END IF;
 WHEN 'out','loss' THEN
  NEW.physical_delta:=-NEW.base_quantity;
  NEW.value_delta:=-CASE WHEN NEW.base_quantity=s.physical THEN s.value WHEN s.physical>0 THEN round(s.value*NEW.base_quantity/s.physical,6) ELSE 0 END;
 WHEN 'reserve' THEN NEW.reserved_delta:=NEW.base_quantity;
 WHEN 'release' THEN NEW.reserved_delta:=-NEW.base_quantity;
 WHEN 'reverse' THEN
  SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
  IF original.production_run_id IS NOT NULL AND (NEW.production_run_id IS DISTINCT FROM original.production_run_id OR prod_record.status IS DISTINCT FROM 'reversing') THEN RAISE EXCEPTION 'Estorne pelo módulo de produção' USING ERRCODE='P0901';END IF;
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
CREATE OR REPLACE FUNCTION inventory.lot_bridge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b inventory.lots;e inventory.lot_events;original inventory.movements;remaining numeric;taken numeric;event_name text;sum_lots numeric;
BEGIN
 PERFORM 1 FROM inventory.lot_controls WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id FOR UPDATE;
 IF NOT FOUND THEN IF NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'Lote sem controle' USING ERRCODE='P0801';END IF;RETURN NEW;END IF;
 IF NEW.reserved_delta>0 AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN RAISE EXCEPTION 'Saldo de lotes válidos insuficiente para reserva' USING ERRCODE='P0801';END IF;
 IF NEW.physical_delta<0 THEN
  remaining:=-NEW.physical_delta;
  IF (NEW.sale_id IS NOT NULL OR NEW.production_role='input') AND NEW.kind='out' THEN
   FOR b IN SELECT * FROM inventory.lots WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id AND quantity>0 AND NOT blocked AND expires_on>=inventory.lot_today() ORDER BY expires_on,created_at,id FOR UPDATE LOOP
    taken:=least(remaining,b.quantity);UPDATE inventory.lots SET quantity=quantity-taken,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=b.id;
    INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,b.id,CASE WHEN NEW.production_role='input' THEN 'production_input' ELSE 'sale' END,-taken,NEW.id,NEW.reason,NEW.actor_name);
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
CREATE FUNCTION supermarket.validate_measurement(branch uuid,product uuid,unit text,quantity numeric,input jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE piece jsonb;parts jsonb;result jsonb:='[]';part jsonb;decoded jsonb;g numeric;t numeric;total numeric:=0;q numeric;BEGIN
 IF NOT pos.permitted(identity.current_auth_tenant_id(),'pos.read',branch) THEN RAISE EXCEPTION 'Unidade não autorizada' USING ERRCODE='42501';END IF;
 IF input IS NULL OR input='null'::jsonb THEN RETURN CASE WHEN unit='KG' THEN jsonb_build_object('source','manual_quantity','quantity',quantity::text) ELSE NULL END;END IF;
 IF unit<>'KG' THEN RAISE EXCEPTION 'Pesagem exige KG' USING ERRCODE='P0901';END IF;
 parts:=CASE WHEN input->>'source'='combined' THEN input->'parts' ELSE jsonb_build_array(input) END;
 IF jsonb_typeof(parts)<>'array' OR jsonb_array_length(parts) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Pesagens inválidas' USING ERRCODE='P0901';END IF;
 FOR piece IN SELECT value FROM jsonb_array_elements(parts) LOOP
  IF piece->>'source'='label' THEN
   decoded:=supermarket.decode_label(branch,piece->>'barcode');
   IF decoded IS NULL OR decoded->>'productId'<>product::text THEN RAISE EXCEPTION 'Etiqueta de outro produto' USING ERRCODE='P0901';END IF;
   q:=(decoded->>'quantity')::numeric;part:=decoded-'price'-'product';
  ELSIF piece->>'source'='manual' THEN
   g:=(piece->>'gross')::numeric;t:=(piece->>'tare')::numeric;q:=g-t;
   IF g IS NULL OR t IS NULL OR g>99.999 OR t<0 OR q<=0 OR round(g,3)<>g OR round(t,3)<>t THEN RAISE EXCEPTION 'Peso manual inválido' USING ERRCODE='P0901';END IF;
   part:=jsonb_build_object('source','manual','gross',g::text,'tare',t::text,'quantity',q::text);
  ELSE RAISE EXCEPTION 'Origem inválida' USING ERRCODE='P0901';END IF;
  total:=total+q;result:=result||jsonb_build_array(part);
 END LOOP;
 IF total<>quantity THEN RAISE EXCEPTION 'Quantidade difere da pesagem' USING ERRCODE='P0901';END IF;
 RETURN CASE WHEN input->>'source'='combined' THEN jsonb_build_object('source','combined','parts',result,'quantity',total::text) ELSE result->0 END;
END $$;
CREATE OR REPLACE FUNCTION pos.save_sale(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();target uuid:=(input->>'id')::uuid;r pos.registers;previous pos.sales;p inventory.products;line jsonb;items jsonb:='[]';allocated jsonb:='[]';gross_amount numeric:=0;amount numeric;discount_amount numeric:=(input->>'discount')::numeric;acc numeric:=0;net_acc numeric:=0;net numeric;who text;unit_data jsonb;idx integer:=0;measurement jsonb;decoded jsonb;g numeric;t numeric;
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
  INSERT INTO pos.sales(tenant_id,unit_id,register_id,operator_id,operator_name,unit_snapshot,items,gross,discount,total,notes,request_key,request_payload) VALUES(network,r.unit_id,r.id,identity.current_auth_actor_id(),who,unit_data,allocated,gross_amount,discount_amount,net,input->>'notes',(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 ELSE UPDATE pos.sales SET items=allocated,gross=gross_amount,discount=discount_amount,total=net,notes=input->>'notes',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;

CREATE FUNCTION supermarket.sale_allowed(branch uuid,product uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pos.permitted(identity.current_auth_tenant_id(),'pos.read',branch) AND NOT EXISTS(SELECT 1 FROM supermarket.product_profiles p JOIN supermarket.sectors s ON s.tenant_id=p.tenant_id AND s.id=p.sector_id WHERE p.tenant_id=identity.current_auth_tenant_id() AND p.unit_id=branch AND p.product_id=product AND NOT s.active)
$$;

CREATE OR REPLACE FUNCTION pos.catalog(branch uuid,query_text text,barcode_text text,offset_page integer) RETURNS TABLE(id uuid,code text,name text,base_unit text,category text,price numeric,available numeric,barcodes text[],total_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id,p.code,p.name,p.base_unit,p.category,p.sale_price,greatest(0,inventory.lot_sellable(p.tenant_id,branch,p.id,coalesce(l.physical,0))-coalesce(l.reserved,0)),p.barcodes,count(*) OVER()
 FROM inventory.products p LEFT JOIN inventory.levels l ON l.tenant_id=p.tenant_id AND l.unit_id=branch AND l.product_id=p.id
 WHERE p.tenant_id=identity.current_auth_tenant_id() AND pos.permitted(p.tenant_id,'pos.read',branch) AND p.active AND p.sale_price>0 AND supermarket.sale_allowed(branch,p.id)
 AND (barcode_text='' OR EXISTS(SELECT 1 FROM inventory.barcodes b WHERE b.tenant_id=p.tenant_id AND b.product_id=p.id AND b.barcode=lpad(barcode_text,14,'0')))
 AND (query_text='' OR position(lower(query_text) in lower(p.name||' '||p.code||' '||p.category||' '||array_to_string(p.barcodes,' ')))>0)
 ORDER BY p.name,p.id LIMIT 20 OFFSET greatest(0,least(offset_page,1000))*20
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA supermarket FROM PUBLIC;

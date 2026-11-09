CREATE SCHEMA inventory;
REVOKE ALL ON SCHEMA inventory FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read','products.read','products.manage','stock.read','stock.manage']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT products_manage_read CHECK(NOT 'products.manage'=ANY(permissions) OR 'products.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT stock_read_products CHECK(NOT 'stock.read'=ANY(permissions) OR 'products.read'=ANY(permissions));
ALTER TABLE access.roles ADD CONSTRAINT stock_manage_read CHECK(NOT 'stock.manage'=ANY(permissions) OR ('stock.read'=ANY(permissions) AND 'products.read'=ANY(permissions)));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=permissions||ARRAY['products.read','products.manage','stock.read','stock.manage']::text[] WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;

CREATE FUNCTION inventory.allowed(network uuid,permission text,branch uuid DEFAULT NULL,global_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT network=identity.current_auth_tenant_id() AND EXISTS(
 SELECT 1 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id JOIN tenancy.tenants t ON t.id=m.tenant_id
 LEFT JOIN access.roles r ON r.tenant_id=m.tenant_id AND r.id=m.role_id
 WHERE m.tenant_id=network AND m.user_id=identity.current_auth_actor_id() AND m.active AND u.active AND t.active
 AND (m.is_owner OR permission=ANY(r.permissions))
 AND (NOT global_only OR m.is_owner OR m.all_units)
 AND (branch IS NULL OR (organizations.unit_available(branch) AND (m.is_owner OR m.all_units OR EXISTS(SELECT 1 FROM organizations.membership_units a WHERE a.tenant_id=m.tenant_id AND a.membership_id=m.id AND a.unit_id=branch)))))
$$;
REVOKE ALL ON FUNCTION inventory.allowed(uuid,text,uuid,boolean) FROM PUBLIC;
GRANT USAGE ON SCHEMA inventory TO invictus_auth;
GRANT EXECUTE ON FUNCTION inventory.allowed(uuid,text,uuid,boolean) TO invictus_auth;

CREATE TABLE inventory.products(
 tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 category text NOT NULL DEFAULT '' CHECK(length(category)<=80),brand text NOT NULL DEFAULT '' CHECK(length(brand)<=80),
 base_unit text NOT NULL CHECK(base_unit IN('UN','KG','G','L','ML','PCT','CX','FD','SC')),
 package_name text NOT NULL DEFAULT '' CHECK(length(package_name)<=40), package_factor numeric(15,3) NOT NULL DEFAULT 1 CHECK(package_factor>0),
 barcodes text[] NOT NULL DEFAULT '{}' CHECK(cardinality(barcodes)<=20),
 sale_price numeric(15,2) NOT NULL CHECK(sale_price>=0), desired_margin numeric(5,2) NOT NULL DEFAULT 0 CHECK(desired_margin>=0 AND desired_margin<100),
 minimum_margin numeric(5,2) NOT NULL DEFAULT 0 CHECK(minimum_margin>=0 AND minimum_margin<100),
 minimum_stock numeric(15,3) NOT NULL DEFAULT 0 CHECK(minimum_stock>=0), ideal_stock numeric(15,3) NOT NULL DEFAULT 0 CHECK(ideal_stock>=minimum_stock),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,code)
);
CREATE TABLE inventory.barcodes(
 tenant_id uuid NOT NULL,barcode text NOT NULL CHECK(barcode ~ '^[0-9]{8,14}$'),product_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,barcode), FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id)
);
CREATE TABLE inventory.levels(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,product_id uuid NOT NULL,
 physical numeric(18,3) NOT NULL DEFAULT 0 CHECK(physical>=0),reserved numeric(18,3) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=physical),
 value numeric(24,6) NOT NULL DEFAULT 0 CHECK(value>=0),last_cost numeric(18,6) NOT NULL DEFAULT 0,
 CHECK(physical<>0 OR value=0),PRIMARY KEY(tenant_id,unit_id,product_id),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id)
);
CREATE TABLE inventory.settings(
 tenant_id uuid NOT NULL,unit_id uuid NOT NULL,product_id uuid NOT NULL,
 minimum_stock numeric(15,3) NOT NULL CHECK(minimum_stock>=0),ideal_stock numeric(15,3) NOT NULL CHECK(ideal_stock>=minimum_stock),
 PRIMARY KEY(tenant_id,unit_id,product_id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id)
);
CREATE TABLE inventory.movements(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,product_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('entry','out','loss','reserve','release','reverse')),
 quantity numeric(15,3) NOT NULL CHECK(quantity>0),packaged boolean NOT NULL DEFAULT false,
 factor numeric(15,3) NOT NULL,base_quantity numeric(18,3) NOT NULL,cost numeric(18,6) NOT NULL DEFAULT 0 CHECK(cost>=0),
 physical_delta numeric(18,3) NOT NULL,reserved_delta numeric(18,3) NOT NULL,value_delta numeric(24,6) NOT NULL,
 physical_after numeric(18,3) NOT NULL,reserved_after numeric(18,3) NOT NULL,value_after numeric(24,6) NOT NULL,
 previous_last_cost numeric(18,6) NOT NULL,actor_id uuid NOT NULL REFERENCES identity.users(id),actor_name text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 300),reversal_of uuid,
 request_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,reversal_of),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,product_id) REFERENCES inventory.products(tenant_id,id),
 FOREIGN KEY(tenant_id,reversal_of) REFERENCES inventory.movements(tenant_id,id),CHECK((kind='reverse')=(reversal_of IS NOT NULL))
);
CREATE INDEX movement_product_time ON inventory.movements(tenant_id,unit_id,product_id,created_at DESC,id DESC);
-- Nenhum papel HTTP pode modificar saldos ou apagar movimentos. A confirmação é exclusiva deste trigger.
CREATE POLICY members_inventory_lookup ON organizations.membership_units FOR SELECT TO invictus_migrator USING(true);
CREATE FUNCTION inventory.product_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.code<>OLD.code OR NEW.base_unit<>OLD.base_unit THEN RAISE EXCEPTION 'Código e unidade-base são permanentes' USING ERRCODE='23514'; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Versão inválida' USING ERRCODE='23514'; END IF;
 END IF;
 DELETE FROM inventory.barcodes WHERE tenant_id=NEW.tenant_id AND product_id=NEW.id;
 FOREACH b IN ARRAY NEW.barcodes LOOP
  INSERT INTO inventory.barcodes VALUES(NEW.tenant_id,b,NEW.id);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER product_barcodes AFTER INSERT OR UPDATE ON inventory.products FOR EACH ROW EXECUTE FUNCTION inventory.product_guard();

CREATE FUNCTION inventory.confirm_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p inventory.products; s inventory.levels; original inventory.movements; latest uuid; actor text;
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
 WHEN 'out','loss' THEN
  NEW.physical_delta:=-NEW.base_quantity;
  NEW.value_delta:=-CASE WHEN NEW.base_quantity=s.physical THEN s.value WHEN s.physical>0 THEN round(s.value*NEW.base_quantity/s.physical,6) ELSE 0 END;
 WHEN 'reserve' THEN NEW.reserved_delta:=NEW.base_quantity;
 WHEN 'release' THEN NEW.reserved_delta:=-NEW.base_quantity;
 WHEN 'reverse' THEN
  SELECT * INTO original FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
  SELECT id INTO latest FROM inventory.movements WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF original.id IS NULL OR original.kind='reverse' OR latest<>original.id THEN RAISE EXCEPTION 'Estorne somente o último movimento confirmado deste produto e unidade' USING ERRCODE='23514'; END IF;
  NEW.quantity:=original.quantity;NEW.packaged:=original.packaged;NEW.factor:=original.factor;NEW.base_quantity:=original.base_quantity;NEW.cost:=original.cost;
  NEW.physical_delta:=-original.physical_delta;NEW.reserved_delta:=-original.reserved_delta;NEW.value_delta:=-original.value_delta;s.last_cost:=original.previous_last_cost;
 END CASE;
 NEW.physical_after:=s.physical+NEW.physical_delta;NEW.reserved_after:=s.reserved+NEW.reserved_delta;NEW.value_after:=s.value+NEW.value_delta;
 IF NEW.physical_after<0 OR NEW.reserved_after<0 OR NEW.reserved_after>NEW.physical_after OR NEW.value_after<0 THEN RAISE EXCEPTION 'Saldo físico ou disponível insuficiente' USING ERRCODE='23514'; END IF;
 NEW.actor_id:=identity.current_auth_actor_id();SELECT display_name INTO actor FROM identity.users WHERE id=NEW.actor_id;NEW.actor_name:=actor;
 UPDATE inventory.levels SET physical=NEW.physical_after,reserved=NEW.reserved_after,value=NEW.value_after,last_cost=s.last_cost WHERE tenant_id=NEW.tenant_id AND unit_id=NEW.unit_id AND product_id=NEW.product_id;
 RETURN NEW;
END $$;
CREATE TRIGGER confirm_stock BEFORE INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION inventory.confirm_movement();

ALTER TABLE audit.events DROP CONSTRAINT events_category_check;
ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory'));
CREATE FUNCTION inventory.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; b jsonb; d jsonb; actor uuid; label text; actor_label text; kind text; category text; keys text[];
BEGIN
 a:=to_jsonb(NEW);IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD); END IF;d:=a;
 IF TG_TABLE_NAME='products' THEN
  kind:='product';category:='products';label:=NEW.name;
  keys:=ARRAY['code','name','description','category','brand','base_unit','package_name','package_factor','barcodes','sale_price','desired_margin','minimum_margin','minimum_stock','ideal_stock','active'];
 ELSIF TG_TABLE_NAME='settings' THEN kind:='stock_settings';category:='inventory';keys:=ARRAY['minimum_stock','ideal_stock'];
 ELSE kind:='stock';category:='inventory';keys:=ARRAY['kind','quantity','factor','base_quantity','cost','physical_delta','reserved_delta','value_delta','physical_after','reserved_after','value_after','reason','reversal_of'];END IF;
 IF label IS NULL THEN SELECT name INTO label FROM inventory.products WHERE tenant_id=NEW.tenant_id AND id=NEW.product_id; END IF;
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);
 IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW; END IF;
 actor:=identity.current_auth_actor_id();SELECT display_name INTO actor_label FROM identity.users WHERE id=actor;
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id)
 VALUES(NEW.tenant_id,(d->>'unit_id')::uuid,actor,coalesce(actor_label,'Processo interno'),label,category,kind,coalesce((d->>'id')::uuid,(d->>'product_id')::uuid),kind||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);
 RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_product AFTER INSERT OR UPDATE ON inventory.products FOR EACH ROW EXECUTE FUNCTION inventory.capture_audit();
CREATE TRIGGER audit_capture_stock AFTER INSERT ON inventory.movements FOR EACH ROW EXECUTE FUNCTION inventory.capture_audit();
CREATE TRIGGER audit_capture_stock_settings AFTER INSERT OR UPDATE ON inventory.settings FOR EACH ROW EXECUTE FUNCTION inventory.capture_audit();

ALTER TABLE inventory.products ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory.products FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.barcodes ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory.barcodes FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.levels ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory.levels FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.settings ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory.settings FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.movements ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory.movements FORCE ROW LEVEL SECURITY;
CREATE POLICY product_read ON inventory.products FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'products.read'));
CREATE POLICY product_create ON inventory.products FOR INSERT TO invictus_auth WITH CHECK(inventory.allowed(tenant_id,'products.manage',NULL,true));
CREATE POLICY product_update ON inventory.products FOR UPDATE TO invictus_auth USING(inventory.allowed(tenant_id,'products.manage',NULL,true)) WITH CHECK(inventory.allowed(tenant_id,'products.manage',NULL,true));
CREATE POLICY barcode_read ON inventory.barcodes FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'products.read'));
CREATE POLICY level_read ON inventory.levels FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'stock.read',unit_id));
CREATE POLICY movement_read ON inventory.movements FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'stock.read',unit_id));
CREATE POLICY movement_create ON inventory.movements FOR INSERT TO invictus_auth WITH CHECK(inventory.allowed(tenant_id,'stock.manage',unit_id));
CREATE POLICY setting_read ON inventory.settings FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,'stock.read',unit_id));
CREATE POLICY setting_create ON inventory.settings FOR INSERT TO invictus_auth WITH CHECK(inventory.allowed(tenant_id,'stock.manage',unit_id));
CREATE POLICY setting_update ON inventory.settings FOR UPDATE TO invictus_auth USING(inventory.allowed(tenant_id,'stock.manage',unit_id)) WITH CHECK(inventory.allowed(tenant_id,'stock.manage',unit_id));
CREATE POLICY product_internal ON inventory.products TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY barcode_internal ON inventory.barcodes TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY level_internal ON inventory.levels TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY movement_internal ON inventory.movements TO invictus_migrator USING(true) WITH CHECK(true);
CREATE POLICY setting_internal ON inventory.settings TO invictus_migrator USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON inventory.products,inventory.settings TO invictus_auth;
GRANT SELECT ON inventory.barcodes,inventory.levels TO invictus_auth;
GRANT SELECT,INSERT ON inventory.movements TO invictus_auth;
REVOKE ALL ON FUNCTION inventory.product_guard(),inventory.confirm_movement(),inventory.capture_audit() FROM PUBLIC;

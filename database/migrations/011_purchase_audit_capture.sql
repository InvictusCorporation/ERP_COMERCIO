-- Mantém a migração 010 imutável; remove variável que colidia com a coluna id.
CREATE OR REPLACE FUNCTION purchasing.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];who text;kind text;label text;category text;
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

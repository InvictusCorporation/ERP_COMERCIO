-- Preservar variável de evento e alias distintos na restauração.
CREATE OR REPLACE FUNCTION crm.restore_lots() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE e inventory.lot_events;BEGIN
 IF NEW.customer_role IS DISTINCT FROM 'return' THEN RETURN NEW;END IF;
 FOR e IN SELECT ev.* FROM inventory.lot_events ev JOIN inventory.movements m ON m.tenant_id=ev.tenant_id AND m.id=ev.movement_id WHERE m.tenant_id=NEW.tenant_id AND m.customer_order_id=NEW.customer_order_id AND m.customer_line_id=NEW.customer_line_id AND ev.kind='order_out' LOOP
 UPDATE inventory.lots SET quantity=quantity-e.quantity_delta,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=e.lot_id;
 INSERT INTO inventory.lot_events(tenant_id,unit_id,product_id,lot_id,kind,quantity_delta,movement_id,reason,actor_name) VALUES(NEW.tenant_id,NEW.unit_id,NEW.product_id,e.lot_id,'order_return',-e.quantity_delta,NEW.id,NEW.reason,NEW.actor_name);END LOOP;RETURN NEW;END $$;

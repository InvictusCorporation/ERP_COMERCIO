-- Corrige ambiguidade entre coluna e acumulador de itens na expedição.
CREATE OR REPLACE FUNCTION network.transition_transfer(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE net uuid:=identity.current_auth_tenant_id();r network.transfers;action text:=input->>'action';branch uuid;line jsonb;piece jsonb;confirmed jsonb;result_items jsonb:='[]';amount numeric;total numeric:=0;who text;lot uuid;existing inventory.lots;BEGIN
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
   result_items:=result_items||jsonb_build_array(line||jsonb_build_object('cost',amount::text,'lotTracked',EXISTS(SELECT 1 FROM inventory.lot_controls WHERE tenant_id=net AND unit_id=r.source_id AND product_id=(line->>'productId')::uuid),'lots',coalesce((SELECT jsonb_agg(jsonb_build_object('sourceLotId',b.id,'code',b.code,'manufacturedOn',b.manufactured_on,'expiresOn',b.expires_on,'quantity',(-e.quantity_delta)::text) ORDER BY b.expires_on,b.created_at,b.id) FROM inventory.lot_events e JOIN inventory.lots b ON b.tenant_id=e.tenant_id AND b.id=e.lot_id WHERE e.tenant_id=net AND e.movement_id=(line->>'outMovementId')::uuid AND e.kind='transfer_out'),'[]')));
  END LOOP;
  UPDATE network.transfers SET status='in_transit',version=version+1,items=result_items,total_cost=total,document_ref=input->>'documentRef',dispatched_by=who,dispatched_at=clock_timestamp(),last_action=input WHERE tenant_id=net AND id=r.id;
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

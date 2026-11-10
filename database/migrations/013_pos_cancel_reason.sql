-- Evita ambiguidade entre parâmetro e coluna no cancelamento.
CREATE OR REPLACE FUNCTION pos.cancel_sale(target uuid,expected integer,reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s pos.sales;
BEGIN
 SELECT * INTO s FROM pos.sales WHERE tenant_id=network AND id=target FOR UPDATE;
 IF s.id IS NULL OR NOT pos.permitted(network,'pos.sell',s.unit_id) OR (s.operator_id<>identity.current_auth_actor_id() AND NOT pos.permitted(network,'pos.refund',s.unit_id)) THEN RAISE EXCEPTION 'Venda não autorizada' USING ERRCODE='42501';END IF;
 IF s.status='cancelled' AND s.version=expected+1 AND s.reason=reason THEN RETURN target;END IF;
 IF s.status NOT IN('draft','pending') OR s.version<>expected OR length(btrim(reason)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Venda desatualizada ou já confirmada' USING ERRCODE='23514';END IF;
 UPDATE pos.payments SET state='cancelled',updated_at=clock_timestamp() WHERE tenant_id=network AND id=s.current_payment_id;
 UPDATE pos.sales SET status='cancelled',reason=$3,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=network AND id=target;RETURN target;
END $$;

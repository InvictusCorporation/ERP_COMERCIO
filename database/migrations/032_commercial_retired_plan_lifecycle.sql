-- Suspender/cancelar um contrato preserva as condições originais, inclusive se
-- o plano foi retirado de novas contratações. Renovação continua exigindo plano ativo.
DO $$DECLARE definition text;needle text:='SELECT * INTO p FROM commercial.plans';guard text;BEGIN
 definition:=pg_get_functiondef('commercial.save_subscription(jsonb)'::regprocedure);
 guard:=$guard$
 IF s.tenant_id IS NOT NULL AND s.plan_id=(input->>'planId')::uuid AND input->>'state' IN('suspended','cancelled') THEN
  IF s.starts_on<>(input->>'startsOn')::date OR s.ends_on<>(input->>'endsOn')::date THEN RAISE EXCEPTION 'Suspensão e cancelamento preservam a vigência registrada' USING ERRCODE='23514';END IF;
  SELECT array_agg(x) INTO mods FROM jsonb_array_elements_text(input->'enabledModules') x;
  IF NOT mods <@ ARRAY(SELECT jsonb_array_elements_text(s.plan_snapshot->'modules')) THEN RAISE EXCEPTION 'Módulo fora das condições registradas' USING ERRCODE='23514';END IF;
  UPDATE commercial.subscriptions SET enabled_modules=mods,state=input->>'state',reason=input->>'reason',version=version+1,updated_at=now() WHERE tenant_id=net RETURNING * INTO s;
  RETURN jsonb_build_object('tenantId',s.tenant_id,'plan',s.plan_snapshot,'enabledModules',s.enabled_modules,'state',s.state,'startsOn',s.starts_on,'endsOn',s.ends_on,'reason',s.reason,'version',s.version);
 END IF;
 $guard$;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Definição anterior de assinatura não encontrada';END IF;
 EXECUTE replace(definition,needle,guard||needle);
END $$;

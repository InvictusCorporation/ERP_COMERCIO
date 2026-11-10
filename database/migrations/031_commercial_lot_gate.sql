-- Lotes compartilham estoque com o PDV; a guarda fica no comando administrativo,
-- mantendo as proteções FEFO e de validade mesmo quando o módulo está indisponível.
DO $$DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('inventory.lot_command(jsonb)'::regprocedure);
 definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN IF NOT commercial.module_allowed(identity.current_auth_tenant_id(),''lots'') THEN RAISE EXCEPTION ''Módulo de lotes não contratado ou assinatura indisponível'' USING ERRCODE=''42501''; END IF;','i');
 EXECUTE definition;
END $$;

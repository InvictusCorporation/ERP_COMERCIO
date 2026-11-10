-- Código de domínio para orientar a correção do vínculo financeiro.
CREATE OR REPLACE FUNCTION finance.guard_receipt_reversal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF OLD.status='confirmed' AND NEW.status='reversed' AND EXISTS(SELECT 1 FROM finance.titles WHERE tenant_id=NEW.tenant_id AND purchase_receipt_id=NEW.id AND NOT cancelled) THEN RAISE EXCEPTION 'Cancele o título financeiro vinculado antes de estornar o recebimento' USING ERRCODE='P0501';END IF;RETURN NEW;END $$;

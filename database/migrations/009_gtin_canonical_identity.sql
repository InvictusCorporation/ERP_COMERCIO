-- GTINs com zeros de preenchimento representam a mesma identidade comercial.
-- Uma forma de 13 dígitos e sua representação de 14 não podem identificar produtos diferentes.
CREATE OR REPLACE FUNCTION inventory.product_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.code<>OLD.code OR NEW.base_unit<>OLD.base_unit THEN RAISE EXCEPTION 'Código e unidade-base são permanentes' USING ERRCODE='23514'; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Versão inválida' USING ERRCODE='23514'; END IF;
 END IF;
 DELETE FROM inventory.barcodes WHERE tenant_id=NEW.tenant_id AND product_id=NEW.id;
 FOREACH b IN ARRAY NEW.barcodes LOOP
  INSERT INTO inventory.barcodes VALUES(NEW.tenant_id,lpad(b,14,'0'),NEW.id);
 END LOOP;
 RETURN NEW;
END $$;
-- A chave derivada é normalizada dentro da migração atômica.
-- Uma eventual colisão interrompe a migração inteira e preserva o estado anterior.
UPDATE inventory.barcodes SET barcode=lpad(barcode,14,'0');

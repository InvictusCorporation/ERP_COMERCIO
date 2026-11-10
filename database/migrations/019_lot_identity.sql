-- Mesmo código impresso pode reaparecer com outro vencimento, sem reescrever o lote anterior.
ALTER TABLE inventory.lots DROP CONSTRAINT lots_tenant_id_unit_id_product_id_code_key;
ALTER TABLE inventory.lots ADD CONSTRAINT lot_printed_identity UNIQUE(tenant_id,unit_id,product_id,code,expires_on);
-- Identificação explícita no movimento é usada somente pelo descarte; vendas têm eventos FEFO por linha.
ALTER TABLE inventory.movements ADD CONSTRAINT stock_lot_loss_only CHECK(lot_id IS NULL OR kind='loss');

-- Preserva reservas vendáveis depois do FEFO de insumos; estoque vencido não cobre reserva.
CREATE FUNCTION supermarket.guard_production_reserves() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.production_role='input' AND NEW.kind='out'
    AND inventory.lot_sellable(NEW.tenant_id,NEW.unit_id,NEW.product_id,NEW.physical_after)<NEW.reserved_after THEN
  RAISE EXCEPTION 'Produção não pode consumir lotes válidos reservados para vendas' USING ERRCODE='P0801';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION supermarket.guard_production_reserves() FROM PUBLIC;
-- Triggers AFTER de mesma espécie executam por nome: depois de zz_lot_bridge.
CREATE TRIGGER zzz_market_reserves AFTER INSERT ON inventory.movements
FOR EACH ROW EXECUTE FUNCTION supermarket.guard_production_reserves();

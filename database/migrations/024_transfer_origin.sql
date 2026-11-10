-- CHECK não pode aceitar origem incompleta pelo resultado SQL NULL.
ALTER TABLE inventory.movements DROP CONSTRAINT transfer_movement_pair;
ALTER TABLE inventory.movements ADD CONSTRAINT transfer_movement_pair CHECK(
 (transfer_id IS NULL AND transfer_line_id IS NULL AND transfer_role IS NULL)
 OR (transfer_id IS NOT NULL AND transfer_line_id IS NOT NULL AND transfer_role IS NOT NULL AND transfer_role IN('out','in'))
);

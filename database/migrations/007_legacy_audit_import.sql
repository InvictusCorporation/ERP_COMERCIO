-- A tabela legada usa FORCE RLS. O migrador precisa de política explícita
-- para importar os eventos de rede; a conta HTTP continua sem SELECT nela.
CREATE POLICY legacy_access_audit_migration ON access.events FOR SELECT TO invictus_migrator USING(true);
INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,legacy,legacy_origin,created_at)
SELECT e.tenant_id,CASE WHEN e.action LIKE 'unit.%' THEN e.target_id END,e.actor_id,u.display_name,'Registro anterior',
 CASE WHEN e.action LIKE 'company.%' OR e.action LIKE 'unit.%' THEN 'organizations' WHEN e.action LIKE 'role.%' THEN 'permissions' WHEN e.action LIKE 'invite.%' THEN 'invitations' ELSE 'users' END,
 split_part(e.action,'.',1),e.target_id,e.action,true,'access/'||e.id,e.created_at FROM access.events e JOIN identity.users u ON u.id=e.actor_id
ON CONFLICT(legacy_origin) DO NOTHING;

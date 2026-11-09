-- Exclusivo de banco criado pelo executor de integração. Nunca executar em dev/produção.
DO $$ BEGIN
  IF current_database() !~ '^invictus_test_[a-f0-9]{16}$' THEN
    RAISE EXCEPTION 'Fixture permitida somente em banco de integração identificado';
  END IF;
END $$;

INSERT INTO identity.users(id,email,display_name,active) VALUES
('11111111-1111-4111-8111-111111111111','a@example.invalid','Teste A',true),
('22222222-2222-4222-8222-222222222222','b@example.invalid','Teste B',true),
('33333333-3333-4333-8333-333333333333','shared@example.invalid','Teste compartilhado',true),
('44444444-4444-4444-8444-444444444444','inactive@example.invalid','Teste inativo',false);

INSERT INTO tenancy.tenants(id,name) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Empresa fictícia A'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Empresa fictícia B');

INSERT INTO identity.memberships(tenant_id,id,user_id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a3333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b3333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a4444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444');

INSERT INTO tenancy.settings(tenant_id,id,key,value,updated_by) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a5555555-5555-4555-8555-555555555555','business.name','"Empresa A"','a1111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b5555555-5555-4555-8555-555555555555','business.name','"Empresa B"','b2222222-2222-4222-8222-222222222222');

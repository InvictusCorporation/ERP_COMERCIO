-- Escrituração manual: nenhum envio de dinheiro ou integração bancária.
CREATE SCHEMA finance;
REVOKE ALL ON SCHEMA finance FROM PUBLIC;
ALTER TABLE access.roles DROP CONSTRAINT role_permission_catalog;
ALTER TABLE access.roles ADD CONSTRAINT role_permission_catalog CHECK(permissions <@ ARRAY['users.read','users.manage','roles.manage','organizations.read','organizations.manage','audit.read','products.read','products.manage','stock.read','stock.manage','suppliers.read','suppliers.manage','purchases.read','purchases.manage','purchases.approve','purchases.receive','pos.read','pos.sell','pos.cash','pos.cash.manage','pos.discount','pos.refund','finance.read','finance.manage','finance.settle','finance.reverse','finance.cash']::text[]);
ALTER TABLE access.roles ADD CONSTRAINT finance_dependencies CHECK(NOT(permissions && ARRAY['finance.manage','finance.settle','finance.reverse','finance.cash']::text[]) OR 'finance.read'=ANY(permissions));
ALTER TABLE access.roles NO FORCE ROW LEVEL SECURITY;
UPDATE access.roles SET permissions=permissions||ARRAY['finance.read','finance.manage','finance.settle','finance.reverse','finance.cash']::text[] WHERE system AND name='Administrador';
ALTER TABLE access.roles FORCE ROW LEVEL SECURITY;
CREATE TABLE finance.accounts(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),kind text NOT NULL CHECK(kind IN('cash','bank')),
 opening_date date NOT NULL,opening_amount numeric(15,2) NOT NULL,balance numeric(15,2) NOT NULL DEFAULT 0,closed_through date,
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_key uuid NOT NULL,request_payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,unit_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),CHECK(kind<>'cash' OR balance>=0)
);
CREATE UNIQUE INDEX finance_account_name ON finance.accounts(tenant_id,unit_id,lower(name));
CREATE TABLE finance.titles(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,number text NOT NULL DEFAULT('FI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 kind text NOT NULL CHECK(kind IN('payable','receivable')),counterparty text NOT NULL CHECK(length(btrim(counterparty)) BETWEEN 1 AND 160),description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 160),category text NOT NULL DEFAULT '',reference text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',
 issue_date date NOT NULL,due_date date NOT NULL,amount numeric(15,2) NOT NULL CHECK(amount>0),paid numeric(15,2) NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=amount),cancelled boolean NOT NULL DEFAULT false,cancel_reason text,
 installment integer NOT NULL DEFAULT 1,installments integer NOT NULL DEFAULT 1 CHECK(installments BETWEEN 1 AND 36),version integer NOT NULL DEFAULT 1,purchase_receipt_id uuid,source_snapshot jsonb,
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,number),UNIQUE(tenant_id,request_key,installment),UNIQUE(tenant_id,purchase_receipt_id),FOREIGN KEY(tenant_id,unit_id) REFERENCES organizations.units(tenant_id,id),FOREIGN KEY(tenant_id,purchase_receipt_id) REFERENCES purchasing.receipts(tenant_id,id),CHECK(due_date>=issue_date),CHECK(NOT cancelled OR paid=0)
);
CREATE INDEX finance_titles_due ON finance.titles(tenant_id,unit_id,kind,due_date,id);
CREATE TABLE finance.settlements(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,title_id uuid NOT NULL,account_id uuid NOT NULL,
 principal numeric(15,2) NOT NULL CHECK(principal>0),interest numeric(15,2) NOT NULL CHECK(interest>=0),fee numeric(15,2) NOT NULL CHECK(fee>=0),discount numeric(15,2) NOT NULL CHECK(discount>=0 AND discount<=principal),cash_amount numeric(15,2) NOT NULL CHECK(cash_amount>0),posted_date date NOT NULL,
 method text NOT NULL CHECK(method IN('cash','pix','debit','credit','transfer','other')),reference text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',actor_name text NOT NULL,reversed_at timestamptz,reversed_by text,reversal_reason text,
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,title_id) REFERENCES finance.titles(tenant_id,id),FOREIGN KEY(tenant_id,unit_id,account_id) REFERENCES finance.accounts(tenant_id,unit_id,id),CHECK(cash_amount=principal+interest+fee-discount)
);
CREATE TABLE finance.entries(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,account_id uuid NOT NULL,settlement_id uuid,transfer_id uuid,reversal_of uuid,
 kind text NOT NULL CHECK(kind IN('opening','settlement','reversal','supply','withdraw','transfer_in','transfer_out')),amount numeric(15,2) NOT NULL,balance_after numeric(15,2) NOT NULL DEFAULT 0,posted_date date NOT NULL,description text NOT NULL CHECK(length(btrim(description)) BETWEEN 3 AND 300),actor_name text NOT NULL DEFAULT '',
 request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),UNIQUE(tenant_id,reversal_of),UNIQUE(tenant_id,settlement_id,kind),UNIQUE(tenant_id,transfer_id,kind),FOREIGN KEY(tenant_id,unit_id,account_id) REFERENCES finance.accounts(tenant_id,unit_id,id),FOREIGN KEY(tenant_id,settlement_id) REFERENCES finance.settlements(tenant_id,id),FOREIGN KEY(tenant_id,reversal_of) REFERENCES finance.entries(tenant_id,id),CHECK(kind='opening' OR amount<>0)
);
CREATE INDEX finance_entries_time ON finance.entries(tenant_id,unit_id,account_id,posted_date DESC,created_at DESC,id DESC);
CREATE TABLE finance.closings(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),unit_id uuid NOT NULL,account_id uuid NOT NULL,through_date date NOT NULL,expected numeric(15,2) NOT NULL,counted numeric(15,2) NOT NULL CHECK(counted>=0),difference numeric(15,2) NOT NULL,notes text NOT NULL DEFAULT '',actor_name text NOT NULL,
 reopened_at timestamptz,reopened_by text,reopen_reason text,request_key uuid NOT NULL,request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_key),FOREIGN KEY(tenant_id,unit_id,account_id) REFERENCES finance.accounts(tenant_id,unit_id,id),CHECK(difference=counted-expected)
);
CREATE UNIQUE INDEX finance_closing_date ON finance.closings(tenant_id,account_id,through_date) WHERE reopened_at IS NULL;
GRANT USAGE ON SCHEMA finance TO invictus_auth;
GRANT SELECT ON ALL TABLES IN SCHEMA finance TO invictus_auth;
DO $$DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['accounts','titles','settlements','entries','closings'] LOOP
 EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY finance_read ON finance.%I FOR SELECT TO invictus_auth USING(inventory.allowed(tenant_id,''finance.read'',unit_id))',tab);
 EXECUTE format('CREATE POLICY finance_internal ON finance.%I TO invictus_migrator USING(true) WITH CHECK(true)',tab);
END LOOP;END $$;
CREATE FUNCTION finance.today() RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT (now() AT TIME ZONE 'America/Fortaleza')::date$$;
CREATE FUNCTION finance.require_action(permission text,branch uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT inventory.allowed(identity.current_auth_tenant_id(),permission,branch) THEN RAISE EXCEPTION 'Unidade ou ação não autorizada' USING ERRCODE='42501';END IF;END $$;
CREATE FUNCTION finance.confirm_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a finance.accounts;latest date;BEGIN
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=NEW.tenant_id AND id=NEW.account_id AND unit_id=NEW.unit_id FOR UPDATE;
 PERFORM finance.require_action('finance.read',NEW.unit_id);
 SELECT max(posted_date) INTO latest FROM finance.entries WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id;
 IF a.id IS NULL OR NOT a.active OR NEW.posted_date< a.opening_date OR NEW.posted_date>finance.today() OR NEW.posted_date<=a.closed_through OR (a.kind='cash' AND NEW.posted_date<latest) THEN RAISE EXCEPTION 'Conta inativa, período fechado ou data inválida' USING ERRCODE='23514';END IF;
 NEW.balance_after:=a.balance+NEW.amount;
 IF a.kind='cash' AND NEW.balance_after<0 THEN RAISE EXCEPTION 'Saldo insuficiente em caixa' USING ERRCODE='23514';END IF;
 SELECT display_name INTO NEW.actor_name FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE finance.accounts SET balance=NEW.balance_after,version=version+1 WHERE tenant_id=NEW.tenant_id AND id=NEW.account_id;RETURN NEW;
END $$;
CREATE TRIGGER finance_confirm_entry BEFORE INSERT ON finance.entries FOR EACH ROW EXECUTE FUNCTION finance.confirm_entry();
CREATE FUNCTION finance.save_account(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();a finance.accounts;target uuid:=(input->>'id')::uuid;BEGIN
 PERFORM finance.require_action('finance.manage',(input->>'unitId')::uuid);
 IF target IS NULL THEN
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF a.id IS NOT NULL THEN IF a.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN a.id;END IF;
 IF (input->>'openingDate')::date>finance.today() OR (input->>'openingAmount')::numeric<0 OR (SELECT count(*) FROM finance.accounts WHERE tenant_id=network AND unit_id=(input->>'unitId')::uuid AND active)>=100 THEN RAISE EXCEPTION 'Abertura ou limite de contas inválido' USING ERRCODE='23514';END IF;
 INSERT INTO finance.accounts(tenant_id,unit_id,name,kind,opening_date,opening_amount,active,request_key,request_payload) VALUES(network,(input->>'unitId')::uuid,input->>'name',input->>'kind',(input->>'openingDate')::date,(input->>'openingAmount')::numeric,true,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,(input->>'unitId')::uuid,target,'opening',(input->>'openingAmount')::numeric,(input->>'openingDate')::date,'Saldo inicial informado',gen_random_uuid(),input);
 ELSE
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND id=target FOR UPDATE;
 IF a.id IS NULL OR a.unit_id<>(input->>'unitId')::uuid OR a.version<>(input->>'version')::integer OR a.kind<>input->>'kind' OR a.opening_date<>(input->>'openingDate')::date OR a.opening_amount<>(input->>'openingAmount')::numeric OR (NOT (input->>'active')::boolean AND a.balance<>0) THEN RAISE EXCEPTION 'Conta desatualizada, saldo pendente ou identidade alterada' USING ERRCODE='23514';END IF;
 UPDATE finance.accounts SET name=input->>'name',active=(input->>'active')::boolean,version=version+1 WHERE tenant_id=network AND id=target;
 END IF;RETURN target;
END $$;
CREATE FUNCTION finance.create_titles(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();previous finance.titles;target uuid;idx integer;count integer:=(input->>'installments')::integer;total_amount numeric:=(input->>'amount')::numeric;allocated numeric:=0;part numeric;BEGIN
 PERFORM finance.require_action('finance.manage',(input->>'unitId')::uuid);
 SELECT * INTO previous FROM finance.titles WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid ORDER BY installment LIMIT 1;
 IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN previous.id;END IF;
 IF count NOT BETWEEN 1 AND 36 OR total_amount*100<count OR (input->>'issueDate')::date>finance.today() OR (input->>'dueDate')::date<(input->>'issueDate')::date THEN RAISE EXCEPTION 'Valor, parcelas ou datas inválidos' USING ERRCODE='23514';END IF;
 FOR idx IN 1..count LOOP
 part:=round(total_amount*idx/count,2)-allocated;allocated:=allocated+part;
 INSERT INTO finance.titles(tenant_id,unit_id,kind,counterparty,description,category,reference,notes,issue_date,due_date,amount,installment,installments,request_key,request_payload) VALUES(network,(input->>'unitId')::uuid,input->>'kind',input->>'counterparty',input->>'description',input->>'category',input->>'reference',input->>'notes',(input->>'issueDate')::date,(input->>'dueDate')::date+(idx-1)*(input->>'intervalDays')::integer,part,idx,count,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 IF idx=1 THEN previous.id:=target;END IF;
 END LOOP;RETURN previous.id;
END $$;
CREATE FUNCTION finance.change_title(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();t finance.titles;BEGIN
 SELECT * INTO t FROM finance.titles WHERE tenant_id=network AND id=(input->>'titleId')::uuid FOR UPDATE;
 PERFORM finance.require_action('finance.manage',t.unit_id);
 IF t.id IS NULL OR t.cancelled OR t.version<>(input->>'version')::integer OR (input->>'dueDate')::date<t.issue_date THEN RAISE EXCEPTION 'Título desatualizado ou data inválida' USING ERRCODE='23514';END IF;
 UPDATE finance.titles SET due_date=(input->>'dueDate')::date,notes=input->>'notes',version=version+1 WHERE tenant_id=network AND id=t.id;RETURN t.id;
END $$;
CREATE FUNCTION finance.cancel_title(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();t finance.titles;BEGIN
 SELECT * INTO t FROM finance.titles WHERE tenant_id=network AND id=(input->>'titleId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.manage',t.unit_id);
 IF t.cancelled AND t.cancel_reason=input->>'reason' THEN RETURN t.id;END IF;
 IF t.id IS NULL OR t.version<>(input->>'version')::integer OR t.paid<>0 THEN RAISE EXCEPTION 'Estorne as baixas antes de cancelar' USING ERRCODE='23514';END IF;
 UPDATE finance.titles SET cancelled=true,cancel_reason=input->>'reason',version=version+1 WHERE tenant_id=network AND id=t.id;RETURN t.id;
END $$;

CREATE FUNCTION finance.settle(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();t finance.titles;s finance.settlements;a finance.accounts;target uuid;net numeric;who text;BEGIN
 SELECT * INTO t FROM finance.titles WHERE tenant_id=network AND id=(input->>'titleId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.settle',t.unit_id);
 SELECT * INTO s FROM finance.settlements WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF s.id IS NOT NULL THEN IF s.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN s.id;END IF;
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND id=(input->>'accountId')::uuid AND unit_id=t.unit_id FOR UPDATE;
 IF t.id IS NULL OR t.cancelled OR t.version<>(input->>'version')::integer OR a.id IS NULL OR NOT a.active OR (input->>'principal')::numeric>t.amount-t.paid OR (input->>'postedDate')::date<t.issue_date THEN RAISE EXCEPTION 'Título, valor, conta ou versão indisponível' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM finance.settlements WHERE tenant_id=network AND title_id=t.id)>=500 THEN RAISE EXCEPTION 'Limite de baixas atingido' USING ERRCODE='23514';END IF;
 net:=(input->>'principal')::numeric+(input->>'interest')::numeric+(input->>'fee')::numeric-(input->>'discount')::numeric;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO finance.settlements(tenant_id,unit_id,title_id,account_id,principal,interest,fee,discount,cash_amount,posted_date,method,reference,notes,actor_name,request_key,request_payload) VALUES(network,t.unit_id,t.id,a.id,(input->>'principal')::numeric,(input->>'interest')::numeric,(input->>'fee')::numeric,(input->>'discount')::numeric,net,(input->>'postedDate')::date,input->>'method',input->>'reference',input->>'notes',who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,settlement_id,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,t.unit_id,a.id,target,'settlement',CASE t.kind WHEN 'payable' THEN -net ELSE net END,(input->>'postedDate')::date,left('Baixa '||t.number||' · '||t.description,300),gen_random_uuid(),input);
 UPDATE finance.titles SET paid=paid+(input->>'principal')::numeric,version=version+1 WHERE tenant_id=network AND id=t.id;RETURN target;
END $$;
CREATE FUNCTION finance.reverse_settlement(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();s finance.settlements;t finance.titles;e finance.entries;who text;BEGIN
 SELECT * INTO s FROM finance.settlements WHERE tenant_id=network AND id=(input->>'settlementId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.reverse',s.unit_id);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Baixa indisponível' USING ERRCODE='23514';END IF;
 IF s.reversed_at IS NOT NULL THEN IF s.reversal_reason=input->>'reason' THEN RETURN s.id;END IF;RAISE EXCEPTION 'Baixa já estornada' USING ERRCODE='23514';END IF;
 SELECT * INTO t FROM finance.titles WHERE tenant_id=network AND id=s.title_id FOR UPDATE;
 SELECT * INTO e FROM finance.entries WHERE tenant_id=network AND settlement_id=s.id AND kind='settlement';
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,settlement_id,reversal_of,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,s.unit_id,s.account_id,s.id,e.id,'reversal',-e.amount,finance.today(),left('Estorno '||t.number||' · '||(input->>'reason'),300),gen_random_uuid(),input);
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE finance.settlements SET reversed_at=clock_timestamp(),reversed_by=who,reversal_reason=input->>'reason' WHERE tenant_id=network AND id=s.id;
 UPDATE finance.titles SET paid=paid-s.principal,version=version+1 WHERE tenant_id=network AND id=t.id;RETURN s.id;
END $$;
CREATE FUNCTION finance.cash_operation(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();a finance.accounts;b finance.accounts;previous finance.entries;target uuid;value_amount numeric:=(input->>'amount')::numeric;BEGIN
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND id=(input->>'accountId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.cash',a.unit_id);
 SELECT * INTO previous FROM finance.entries WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF previous.id IS NOT NULL THEN IF previous.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN coalesce(previous.transfer_id,previous.id);END IF;
 IF a.id IS NULL OR value_amount<=0 THEN RAISE EXCEPTION 'Conta ou valor inválido' USING ERRCODE='23514';END IF;
 IF input->>'kind'='transfer' THEN
 SELECT * INTO b FROM finance.accounts WHERE tenant_id=network AND id=(input->>'destinationId')::uuid AND unit_id=a.unit_id FOR UPDATE;
 IF b.id IS NULL OR b.id=a.id THEN RAISE EXCEPTION 'Destino deve ser outra conta da mesma unidade' USING ERRCODE='23514';END IF;
 target:=gen_random_uuid();
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,transfer_id,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,a.unit_id,a.id,target,'transfer_out',-value_amount,(input->>'postedDate')::date,input->>'reason',(input->>'requestKey')::uuid,input);
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,transfer_id,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,a.unit_id,b.id,target,'transfer_in',value_amount,(input->>'postedDate')::date,input->>'reason',gen_random_uuid(),input);
 ELSE
 IF input->>'kind' NOT IN('supply','withdraw') THEN RAISE EXCEPTION 'Operação inválida' USING ERRCODE='23514';END IF;
 INSERT INTO finance.entries(tenant_id,unit_id,account_id,kind,amount,posted_date,description,request_key,request_payload) VALUES(network,a.unit_id,a.id,input->>'kind',CASE input->>'kind' WHEN 'withdraw' THEN -value_amount ELSE value_amount END,(input->>'postedDate')::date,input->>'reason',(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 END IF;RETURN target;
END $$;
CREATE FUNCTION finance.close_account(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();a finance.accounts;c finance.closings;target uuid;who text;BEGIN
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND id=(input->>'accountId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.cash',a.unit_id);
 SELECT * INTO c FROM finance.closings WHERE tenant_id=network AND request_key=(input->>'requestKey')::uuid;
 IF c.id IS NOT NULL THEN IF c.request_payload<>input THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='23514';END IF;RETURN c.id;END IF;
 IF a.id IS NULL OR NOT a.active OR a.kind<>'cash' OR (input->>'throughDate')::date>finance.today() OR (input->>'throughDate')::date<a.opening_date OR (input->>'throughDate')::date<=a.closed_through OR EXISTS(SELECT 1 FROM finance.entries WHERE tenant_id=network AND account_id=a.id AND posted_date>(input->>'throughDate')::date) THEN RAISE EXCEPTION 'Fechamento fora de sequência' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO finance.closings(tenant_id,unit_id,account_id,through_date,expected,counted,difference,notes,actor_name,request_key,request_payload) VALUES(network,a.unit_id,a.id,(input->>'throughDate')::date,a.balance,(input->>'counted')::numeric,(input->>'counted')::numeric-a.balance,input->>'notes',who,(input->>'requestKey')::uuid,input) RETURNING id INTO target;
 UPDATE finance.accounts SET closed_through=(input->>'throughDate')::date,version=version+1 WHERE tenant_id=network AND id=a.id;RETURN target;
END $$;
CREATE FUNCTION finance.reopen_account(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();c finance.closings;a finance.accounts;who text;BEGIN
 SELECT * INTO c FROM finance.closings WHERE tenant_id=network AND id=(input->>'closingId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.reverse',c.unit_id);
 IF c.reopened_at IS NOT NULL THEN IF c.reopen_reason=input->>'reason' THEN RETURN c.id;END IF;RAISE EXCEPTION 'Fechamento já reaberto' USING ERRCODE='23514';END IF;
 SELECT * INTO a FROM finance.accounts WHERE tenant_id=network AND id=c.account_id FOR UPDATE;
 IF c.id IS NULL OR NOT a.active OR a.closed_through<>c.through_date OR EXISTS(SELECT 1 FROM finance.entries WHERE tenant_id=network AND account_id=a.id AND posted_date>c.through_date) THEN RAISE EXCEPTION 'Somente o último período sem movimentos posteriores pode reabrir' USING ERRCODE='23514';END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 UPDATE finance.closings SET reopened_at=clock_timestamp(),reopened_by=who,reopen_reason=input->>'reason' WHERE tenant_id=network AND id=c.id;
 UPDATE finance.accounts SET closed_through=(SELECT max(through_date) FROM finance.closings WHERE tenant_id=network AND account_id=a.id AND reopened_at IS NULL),version=version+1 WHERE tenant_id=network AND id=a.id;RETURN c.id;
END $$;
CREATE FUNCTION finance.import_receipt(input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE network uuid:=identity.current_auth_tenant_id();r purchasing.receipts;o purchasing.orders;t finance.titles;target uuid;issued date;BEGIN
 SELECT * INTO r FROM purchasing.receipts WHERE tenant_id=network AND id=(input->>'receiptId')::uuid FOR UPDATE;PERFORM finance.require_action('finance.manage',r.unit_id);
 IF NOT inventory.allowed(network,'purchases.read',r.unit_id) THEN RAISE EXCEPTION 'Consulta de compras necessária' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM finance.titles WHERE tenant_id=network AND purchase_receipt_id=r.id;
 IF t.id IS NOT NULL THEN IF t.request_payload<>input THEN RAISE EXCEPTION 'Recebimento já vinculado' USING ERRCODE='23514';END IF;RETURN t.id;END IF;
 issued:=(r.created_at AT TIME ZONE 'America/Fortaleza')::date;
 IF r.id IS NULL OR r.status<>'confirmed' OR round(r.total,2)<=0 OR (input->>'dueDate')::date<issued THEN RAISE EXCEPTION 'Recebimento ou vencimento inválido' USING ERRCODE='23514';END IF;
 SELECT * INTO o FROM purchasing.orders WHERE tenant_id=network AND id=r.order_id;
 INSERT INTO finance.titles(tenant_id,unit_id,kind,counterparty,description,category,reference,notes,issue_date,due_date,amount,purchase_receipt_id,source_snapshot,request_key,request_payload) VALUES(network,r.unit_id,'payable',o.supplier_snapshot->>'name','Recebimento '||o.number,'Compras',r.document,input->>'notes',issued,(input->>'dueDate')::date,round(r.total,2),r.id,jsonb_build_object('purchaseNumber',o.number,'document',r.document,'receiptTotal',r.total::text,'supplier',o.supplier_snapshot),(input->>'requestKey')::uuid,input) RETURNING id INTO target;RETURN target;
END $$;
CREATE FUNCTION finance.guard_receipt_reversal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF OLD.status='confirmed' AND NEW.status='reversed' AND EXISTS(SELECT 1 FROM finance.titles WHERE tenant_id=NEW.tenant_id AND purchase_receipt_id=NEW.id AND NOT cancelled) THEN RAISE EXCEPTION 'Cancele o título financeiro vinculado antes de estornar o recebimento' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
CREATE TRIGGER finance_receipt_reversal BEFORE UPDATE ON purchasing.receipts FOR EACH ROW EXECUTE FUNCTION finance.guard_receipt_reversal();
ALTER TABLE audit.events DROP CONSTRAINT events_category_check;
ALTER TABLE audit.events ADD CONSTRAINT events_category_check CHECK(category IN('organizations','users','permissions','invitations','security','context','products','inventory','suppliers','purchases','sales','cash','finance'));
CREATE FUNCTION finance.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=to_jsonb(NEW);b jsonb;keys text[];who text;source text;label text;BEGIN
 IF TG_OP='UPDATE' THEN b:=to_jsonb(OLD);END IF;
 CASE TG_TABLE_NAME
 WHEN 'accounts' THEN source:='financial_account';label:=NEW.name;keys:=ARRAY['name','kind','opening_date','opening_amount','balance','closed_through','active'];
 WHEN 'titles' THEN source:='financial_title';label:=NEW.number;keys:=ARRAY['number','kind','counterparty','description','category','reference','notes','issue_date','due_date','amount','paid','cancelled','cancel_reason','installment','installments','purchase_receipt_id','source_snapshot'];
 WHEN 'settlements' THEN source:='financial_settlement';label:='Baixa financeira';keys:=ARRAY['title_id','account_id','principal','interest','fee','discount','cash_amount','posted_date','method','reference','notes','reversed_at','reversed_by','reversal_reason'];
 WHEN 'entries' THEN source:='financial_entry';label:='Lançamento financeiro';keys:=ARRAY['account_id','settlement_id','transfer_id','reversal_of','kind','amount','balance_after','posted_date','description'];
 ELSE source:='financial_closing';label:='Conferência de caixa';keys:=ARRAY['account_id','through_date','expected','counted','difference','notes','reopened_at','reopened_by','reopen_reason'];END CASE;
 SELECT jsonb_object_agg(key,value) INTO a FROM jsonb_each(a) WHERE key=ANY(keys);
 IF b IS NOT NULL THEN SELECT jsonb_object_agg(key,value) INTO b FROM jsonb_each(b) WHERE key=ANY(keys);END IF;
 IF a IS NOT DISTINCT FROM b THEN RETURN NEW;END IF;
 SELECT display_name INTO who FROM identity.users WHERE id=identity.current_auth_actor_id();
 INSERT INTO audit.events(tenant_id,unit_id,actor_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data,request_id) VALUES(NEW.tenant_id,NEW.unit_id,identity.current_auth_actor_id(),coalesce(who,'Processo interno'),label,'finance',source,NEW.id,source||CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.changed' END,b,a,nullif(current_setting('app.audit_request_id',true),'')::uuid);RETURN NEW;
END $$;
CREATE TRIGGER audit_capture_financial_account AFTER INSERT OR UPDATE ON finance.accounts FOR EACH ROW EXECUTE FUNCTION finance.capture_audit();
CREATE TRIGGER audit_capture_financial_title AFTER INSERT OR UPDATE ON finance.titles FOR EACH ROW EXECUTE FUNCTION finance.capture_audit();
CREATE TRIGGER audit_capture_financial_settlement AFTER INSERT OR UPDATE ON finance.settlements FOR EACH ROW EXECUTE FUNCTION finance.capture_audit();
CREATE TRIGGER audit_capture_financial_entry AFTER INSERT ON finance.entries FOR EACH ROW EXECUTE FUNCTION finance.capture_audit();
CREATE TRIGGER audit_capture_financial_closing AFTER INSERT OR UPDATE ON finance.closings FOR EACH ROW EXECUTE FUNCTION finance.capture_audit();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA finance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.save_account(jsonb),finance.create_titles(jsonb),finance.change_title(jsonb),finance.cancel_title(jsonb),finance.settle(jsonb),finance.reverse_settlement(jsonb),finance.cash_operation(jsonb),finance.close_account(jsonb),finance.reopen_account(jsonb),finance.import_receipt(jsonb),finance.today() TO invictus_auth;

CREATE INDEX finance_settlement_title ON finance.settlements(tenant_id,title_id,created_at DESC,id DESC);

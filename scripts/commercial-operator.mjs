import pg from 'pg';
import {readLocalConfig} from './database/local-config.mjs';
const args=process.argv.slice(2);
if(args.length!==2||!['--grant','--revoke'].includes(args[0])||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])){
 console.error('Uso local: npm run commercial:operator -- --grant|--revoke email-do-usuario-existente');process.exitCode=1;
}else{
 const cfg=readLocalConfig(),url=new URL(cfg.adminUrl);url.pathname=new URL(cfg.appUrl).pathname;
 const db=new pg.Client({connectionString:url.href});
 try{
  await db.connect();await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('commercial/operators',0))");
  const user=(await db.query('SELECT id FROM identity.users WHERE email=$1 AND active',[args[1].toLowerCase()])).rows[0];if(!user)throw Error('Usuário ativo não encontrado.');
  const active=args[0]==='--grant',old=(await db.query('SELECT active FROM commercial.operators WHERE user_id=$1',[user.id])).rows[0];
  if(old?.active!==active){
   await db.query('INSERT INTO commercial.operators(user_id,active) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active',[user.id,active]);
   if(active)await db.query('UPDATE identity.credentials SET mfa_required=true WHERE user_id=$1',[user.id]);
   await db.query("INSERT INTO commercial.events(actor_name,action,before_data,after_data) VALUES('Administração local autorizada','commercial_operator.changed',$1,$2)",[old?{user_id:user.id,active:old.active}:null,{user_id:user.id,active}]);
   await db.query("INSERT INTO audit.events(subject_user_id,actor_name,target_label,category,entity_type,entity_id,action,before_data,after_data) VALUES($1,'Administração local autorizada','Acesso Master da plataforma','security','platform_operator',$1,'commercial_operator.changed',$2,$3)",[user.id,old?{active:old.active}:null,{active}]);
  }
  await db.query('COMMIT');console.log(active?'Acesso Master concedido. MFA deve estar configurado e verificado para utilizar o painel.':'Acesso Master revogado. Nenhum vínculo empresarial foi alterado.');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(e.message==='Usuário ativo não encontrado.'?e.message:'Não foi possível alterar o acesso Master. Confira banco, migração e usuário.');process.exitCode=1;}
 finally{await db.end().catch(()=>{});}
}

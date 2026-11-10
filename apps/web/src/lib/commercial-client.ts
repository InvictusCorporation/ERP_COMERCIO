import {AuthClientError} from './auth-client';
export async function commercialRequest<T>(path:string,body?:unknown,csrf?:string):Promise<T>{
 try{
  const r=await fetch('/api/v1/commercial/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf||''},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const result=await r.json().catch(()=>null);
  if(!r.ok)throw new AuthClientError(result?.message||'Não foi possível concluir esta operação.',r.status);
  if(result===null)throw new AuthClientError('Resposta incompleta. Atualize a consulta antes de tentar novamente.',0);
  return result as T;
 }catch(e){if(e instanceof AuthClientError)throw e;throw new AuthClientError('Não foi possível conectar. Confira sua conexão e atualize a consulta.',0);}
}

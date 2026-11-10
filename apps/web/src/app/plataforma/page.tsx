import {redirect} from 'next/navigation';
import {serverSession} from '../../lib/server-session';
import {ConnectionUnavailable} from '../../components/connection-unavailable';
import {Workspace} from '../../components/workspace';
import {CommercialPanel} from '../../components/commercial-panel';
export const metadata={title:'Planos, assinatura e identidade | Invictus ERP Comercial'};
export default async function Page(){const s=await serverSession();if(!s)return <ConnectionUnavailable/>;if(s.stage!=='authenticated')redirect('/verificar-acesso');return <Workspace initialSession={s} section="commercial"><CommercialPanel key={s.activeTenantId} session={s}/></Workspace>;}

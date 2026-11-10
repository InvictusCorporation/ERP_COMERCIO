import {redirect} from 'next/navigation';
import {serverSession} from '../../lib/server-session';
import {ConnectionUnavailable} from '../../components/connection-unavailable';
import {Workspace} from '../../components/workspace';
import {SupermarketPanel} from '../../components/supermarket-panel';
export const metadata={title:'Setores, pesagem e produção | Invictus ERP Comercial'};
export default async function Page(){const session=await serverSession();if(!session)return <ConnectionUnavailable/>;if(session.stage!=='authenticated')redirect('/verificar-acesso');return <Workspace initialSession={session} section="supermarket"><SupermarketPanel key={session.activeTenantId+'/'+session.activeUnitId} session={session}/></Workspace>;}

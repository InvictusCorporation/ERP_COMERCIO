import { redirect } from 'next/navigation';
import { serverSession } from '../../lib/server-session';
import { ConnectionUnavailable } from '../../components/connection-unavailable';
import { Workspace } from '../../components/workspace';
import { NetworkPanel } from '../../components/network-panel';
export const metadata = { title: 'Gestão da rede e distribuição | Invictus ERP Comercial' };
export default async function Page() { const s = await serverSession(); if (!s)
    return <ConnectionUnavailable />; if (s.stage !== 'authenticated')
    redirect('/verificar-acesso'); return <Workspace initialSession={s} section="network"><NetworkPanel key={s.activeTenantId + '/' + s.activeUnitId} session={s}/></Workspace>; }

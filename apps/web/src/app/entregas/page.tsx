import { redirect } from 'next/navigation';
import { serverSession } from '../../lib/server-session';
import { ConnectionUnavailable } from '../../components/connection-unavailable';
import { Workspace } from '../../components/workspace';
import { CrmPanel } from '../../components/crm-panel';
export const metadata = { title: 'Clientes, pedidos e entregas | Invictus ERP Comercial' };
export default async function Page() { const s = await serverSession(); if (!s)
    return <ConnectionUnavailable />; if (s.stage !== 'authenticated')
    redirect('/verificar-acesso'); return <Workspace initialSession={s} section="crm"><CrmPanel key={s.activeTenantId + '/' + s.activeUnitId} session={s} initialTab="deliveries"/></Workspace>; }

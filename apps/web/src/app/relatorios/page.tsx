import { redirect } from 'next/navigation';
import { serverSession } from '../../lib/server-session';
import { ConnectionUnavailable } from '../../components/connection-unavailable';
import { Workspace } from '../../components/workspace';
import { ReportsPanel } from '../../components/reports-panel';
export const metadata = { title: 'Relatórios e indicadores | Invictus ERP Comercial' };
export default async function Page() { const s = await serverSession(); if (!s)
    return <ConnectionUnavailable />; if (s.stage !== 'authenticated')
    redirect('/verificar-acesso'); return <Workspace initialSession={s} section="reports"><ReportsPanel key={s.activeTenantId + '/' + s.activeUnitId} session={s} initialTab="sales"/></Workspace>; }

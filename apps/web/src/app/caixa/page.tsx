import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { PosPanel } from "../../components/pos-panel";
export const metadata = {
  title: "PDV e vendas | Invictus ERP Comercial",
};
export default async function Page() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="pos">
      <PosPanel
        key={session.activeTenantId + "/" + session.activeUnitId}
        session={session} initialTab="cash"
      />
    </Workspace>
  );
}

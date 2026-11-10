import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { LotsPanel } from "../../components/lots-panel";
export const metadata = {
  title: "Lotes e validade | Invictus ERP Comercial",
};
export default async function Page() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="lots">
      <LotsPanel
        key={session.activeTenantId + "/" + session.activeUnitId}
        session={session}
      />
    </Workspace>
  );
}

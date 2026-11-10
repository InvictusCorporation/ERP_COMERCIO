import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { FinancePanel } from "../../components/finance-panel";
export const metadata = {
  title: "Financeiro | Invictus ERP Comercial",
};
export default async function Page() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="finance">
      <FinancePanel
        key={session.activeTenantId + "/" + session.activeUnitId}
        session={session} initialTab="accounts"
      />
    </Workspace>
  );
}

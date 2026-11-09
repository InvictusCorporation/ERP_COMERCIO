import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { InventoryPanel } from "../../components/inventory-panel";
export const metadata = {
  title: "Produtos e estoque | Invictus ERP Comercial",
};
export default async function Products() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="inventory">
      <InventoryPanel
        key={session.activeTenantId + "/" + session.activeUnitId}
        session={session}
      />
    </Workspace>
  );
}

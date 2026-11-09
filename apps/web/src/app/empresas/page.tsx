import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { OrganizationsPanel } from "../../components/organizations-panel";
export const metadata = {
  title: "Empresas e unidades | Invictus ERP Comercial",
};
export default async function Companies() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="organizations">
      <OrganizationsPanel key={session.activeTenantId} session={session} />
    </Workspace>
  );
}

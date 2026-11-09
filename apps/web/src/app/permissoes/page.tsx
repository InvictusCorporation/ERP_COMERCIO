import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { AccessPanel } from "../../components/access-panel";
export const metadata = { title: "Perfis de acesso | Invictus ERP Comercial" };
export default async function Roles() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session}>
      <AccessPanel
        key={session.activeTenantId}
        session={session}
        initialTab="roles"
      />
    </Workspace>
  );
}

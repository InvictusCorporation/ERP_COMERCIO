import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
import { Workspace } from "../../components/workspace";
import { AuditPanel } from "../../components/audit-panel";
export const metadata = {
  title: "Auditoria e histórico | Invictus ERP Comercial",
};
export default async function Audit() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return (
    <Workspace initialSession={session} section="audit">
      <AuditPanel key={session.activeTenantId} session={session} />
    </Workspace>
  );
}

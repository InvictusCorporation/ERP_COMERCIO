import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { SecurityPanel } from "../../components/security-panel";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
export const metadata = {
  title: "Acesso e segurança | Invictus ERP Comercial",
};
export default async function Security() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return <SecurityPanel session={session} />;
}

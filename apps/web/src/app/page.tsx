import { Workspace } from "../components/workspace";
import { serverSession } from "../lib/server-session";
import { ConnectionUnavailable } from "../components/connection-unavailable";
import { redirect } from "next/navigation";
export default async function Page() {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (session.stage !== "authenticated") redirect("/verificar-acesso");
  return <Workspace initialSession={session} />;
}

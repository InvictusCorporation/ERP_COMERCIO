import { redirect } from "next/navigation";
import { serverSession } from "../../lib/server-session";
import { AuthFrame } from "../../components/auth-frame";
import { MfaForm } from "../../components/mfa-form";
import { ConnectionUnavailable } from "../../components/connection-unavailable";
export const metadata = { title: "Verificar acesso | Invictus ERP Comercial" };
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ configurar?: string }>;
}) {
  const session = await serverSession();
  if (!session) return <ConnectionUnavailable />;
  if (
    session.stage === "authenticated" &&
    (session.user.mfaEnabled || (await searchParams).configurar !== "1")
  )
    redirect("/");
  return (
    <AuthFrame>
      <MfaForm session={session} />
    </AuthFrame>
  );
}
